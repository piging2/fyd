/**
 * FYD EDGE-OBJECT EXPERIENCE: edge resolution and object-sheet builder.
 *
 * Pure, deterministic, browser-safe (no DOM, no network, no secrets).
 *
 * Pipeline:
 *   (graph, objectId, viewer)
 *     -> applyPublicVisibilityGate (THE privacy gate: the same rule the
 *        site pages use — spec-pipeline.publicGraph: only visibility
 *        "public" objects, only relationships between public objects.
 *        Nothing in this module does its own visibility check)
 *     -> resolve target object (absent/invisible -> null; the HTTP layer
 *        maps null to 404, indistinguishable from "unknown")
 *     -> group ACTIVE outgoing edges by predicate
 *     -> resolveEdgeKind(predicate, targetSchema) for presentation
 *     -> capabilityOptions (sitespec/schemas.ts: the EXISTING capability
 *        resolution path) intersected with the visitor ask lane's allowed
 *        capabilities -> sheet actions. Only actions that resolve render.
 *     -> classify every claim (DIRECT_FACT / DERIVED_FACT /
 *        OWNER_AUTHORED / GENERATED_COPY)
 *
 * INVARIANT: AN EDGE OBJECT IS NOT SUCCESSFULLY RENDERED UNTIL IT
 * PROVIDES A FUNCTIONAL DOORWAY INTO THE AUTHORIZED BUSINESS GRAPH.
 * Every EdgeTargetItem carries a real targetObjectId; buildObjectSheet
 * never emits decorative or presentation-only items.
 */

import type { PingObject, PingRelationship } from "@/lib/ping/types";
import type { ObjectGraph } from "../sitespec/types";
import {
  capabilityOptions,
  getSchemaDef,
  schemaRole,
  type FYDActionKind,
} from "../sitespec/schemas";
import { resolveSafeLink } from "../sitespec/safe-link";
import type {
  ClaimClass,
  EdgeGroup,
  EdgeKind,
  EdgeTargetItem,
  ObjectSheet,
  SheetAction,
  SheetClaim,
  SheetEvidence,
} from "./types";

/**
 * Who the edge lane serves. The edge lane is the PUBLIC site surface:
 * anonymous visitors, exactly the viewers the rendered site pages serve.
 * The gate below is their only visibility story.
 */
export interface EdgeViewer {
  mode: "visitor";
}

/** The public-site viewer. */
export const EDGE_VISITOR: EdgeViewer = { mode: "visitor" };

/**
 * THE privacy gate for the edge lane. Byte-for-byte the same rule as
 * spec-pipeline.publicGraph (the gate the /sites pages themselves use):
 * keep only visibility==="public" objects, and only relationships whose
 * BOTH endpoints are public. An invisible object yields no sheet (null),
 * which the HTTP layer maps to 404, indistinguishable from "unknown".
 * No oracle, no bypass.
 */
export function applyPublicVisibilityGate(graph: ObjectGraph): ObjectGraph {
  const ids = new Set(
    graph.objects.filter((o) => o.visibility === "public").map((o) => o.id),
  );
  return {
    ...graph,
    objects: graph.objects.filter((o) => ids.has(o.id)),
    relationships: graph.relationships.filter(
      (r) => ids.has(r.subject) && ids.has(r.object),
    ),
  };
}

/**
 * Predicate priority for edge-group ordering. Generic relationship
 * vocabulary only: never business names, never per-site branches.
 * (Source: margin-circles RELATED_PREDICATE_PRIORITY; the sitespec lane
 * does not own this module, so the edge lane carries its own copy.)
 */
const RELATED_PREDICATE_PRIORITY: readonly string[] = [
  "provides",
  "offers",
  "located_at",
  "works_for",
  "links_to",
  "has_website",
];

/**
 * Visitor ask-lane capabilities. Read/ask affordances only: nothing here
 * authorizes publishing, messages, purchases, advertising, provider
 * actions, or business-data mutations. Mirrors the visitor capability set
 * of the Ask FYD lane (visitor mode: anonymous, public objects only).
 */
const VISITOR_ALLOWED_CAPABILITIES: readonly string[] = [
  "ask_question",
  "view_evidence",
  "view_why_this",
];

/** How many edge items the client renders before "show more". The graph
 *  may hold 100 objects; the edge never shows 100 at once. The payload
 *  still carries every authorized item so progressive disclosure never
 *  invents objects. */
export const EDGE_ATTENTION_LIMIT = 8;

/** Pipeline-internal field keys: never rendered as claims. These are the
 *  lane's own bookkeeping, not business facts. (Not business data, so not
 *  business-name conditionals.) */
const INTERNAL_FIELD_KEYS = new Set([
  "claimKind",
  "source_url",
  "source_type",
  "source_digest",
  "observed_at",
  "evidence_ref",
  "service_key",
  "service_href",
]);

/** Predicate -> human group label. Predicate vocabulary only; no
 *  business names, no per-site branches. */
const PREDICATE_LABELS: Record<string, string> = {
  offers: "Services offered",
  provides: "Services offered",
  located_at: "Location",
  works_for: "People",
  employs: "People",
  employed_by: "People",
  links_to: "Connected",
  has_website: "Website",
  references: "References",
  provided_by: "Offered by",
  publishes: "Posts",
  published_by: "Published by",
};

/** Predicates that resolve to a person edge regardless of schema role. */
const PERSON_PREDICATES = new Set(["works_for", "employs", "employed_by"]);
/** Predicates that resolve to an external-identity edge. */
const EXTERNAL_PREDICATES = new Set(["links_to", "has_website"]);

/**
 * resolveEdgeKind: (predicate, targetSchema) -> EdgeKind.
 *
 * Resolution order: predicate + schema role together decide. Unknown
 * predicates fall through to "generic_edge": a functional generic
 * relationship renderer, never a dead end, never dropped.
 */
export function resolveEdgeKind(
  predicate: string,
  targetSchema: string,
): EdgeKind {
  const role = schemaRole(targetSchema);
  if (EXTERNAL_PREDICATES.has(predicate)) return "external_identity_edge";
  if (predicate === "references") return "reference_edge";
  if (PERSON_PREDICATES.has(predicate) || role === "person")
    return "person_edge";
  if (role === "location" && predicate === "located_at")
    return "location_edge";
  if (role === "service") return "service_edge";
  if (role === "business") return "business_edge";
  if (role === "post" || role === "article") return "reference_edge";
  return "generic_edge";
}

/** Human label for a predicate. Schema relationship meaning wins when
 *  the source schema declares it; otherwise the static vocabulary map;
 *  otherwise the prettified predicate. Deterministic. */
export function predicateLabel(
  predicate: string,
  sourceSchema?: string,
): string {
  if (sourceSchema) {
    const def = getSchemaDef(sourceSchema);
    const rule = def?.relationships.find((r) => r.predicate === predicate);
    if (rule && rule.meaning) {
      // Meaning sentences are verbose; the static map holds the compact
      // labels, so prefer it and keep meaning as documentation.
    }
  }
  const mapped = PREDICATE_LABELS[predicate];
  if (mapped) return mapped;
  return predicate
    .split("_")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * classifyClaim: every rendered claim carries its class.
 * - owner-authored provenance ("owner*" kinds; this tree's owner-authored
 *   kind is "overlay-authored") -> OWNER_AUTHORED
 * - computed by the sheet builder (counts, groupings) -> DERIVED_FACT
 * - verbatim source observation -> DIRECT_FACT
 * - renderer template/marketing copy -> GENERATED_COPY (labeled at the
 *   call site; this function only classifies data claims)
 */
export function classifyClaim(args: {
  provenanceKind: string;
  computed: boolean;
}): ClaimClass {
  if (args.computed) return "DERIVED_FACT";
  if (args.provenanceKind.startsWith("owner")) return "OWNER_AUTHORED";
  if (args.provenanceKind === "overlay-authored") return "OWNER_AUTHORED";
  return "DIRECT_FACT";
}

/** Sort key for edge groups: the shared predicate priority first
 *  (RELATED_PREDICATE_PRIORITY), unknown predicates alphabetical after. */
function groupSortKey(predicate: string): [number, number, string] {
  const idx = RELATED_PREDICATE_PRIORITY.indexOf(predicate);
  if (idx >= 0) return [0, idx, ""];
  return [1, 0, predicate];
}

function compareGroupKeys(
  a: [number, number, string],
  b: [number, number, string],
): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0;
}

function safeWebsiteHref(raw: unknown): string | null {
  const r = resolveSafeLink(raw, "navigate");
  return r.kind === "safe" ? r.href : null;
}

/** Map the EXISTING capability resolution to sheet actions. Only actions
 *  that resolve are returned: no invented buttons.
 *
 *  - "ask" (capabilityOptions) + ask lane "ask_question" -> Ask FYD
 *  - ask lane "view_why_this" -> Why this?
 *  - "open" -> Open full node (sheet full-node mode; edge items ARE the
 *    traverse affordance, so "open" is not a second button per item)
 *  - "reference" -> Copy reference
 *  - "open_website" + safe href -> Open website
 *
 *  Capabilities without a sheet affordance (call, email, directions,
 *  follow, like, reply, propose_update, site_propose) render no button.
 *  When a sheet-mapped capability lands, its action appears here with
 *  zero UI changes.
 */
function resolveActions(
  object: PingObject,
  schemaId: string,
  allowedCapabilities: readonly string[],
): SheetAction[] {
  const def = getSchemaDef(schemaId);
  const websiteRaw = object.fields["website"];
  const website =
    typeof websiteRaw === "string" ? safeWebsiteHref(websiteRaw) : null;
  const kinds: FYDActionKind[] = def
    ? capabilityOptions(def, {
        viewerId: null,
        controllerId: object.controllerId,
        hasWebsite: website !== null,
      })
    : (["open", "ask", "reference"] as FYDActionKind[]);

  const actions: SheetAction[] = [];
  const has = (k: FYDActionKind) => kinds.includes(k);
  if (has("ask") && allowedCapabilities.includes("ask_question")) {
    actions.push({ kind: "ask", label: "Ask FYD", capability: "ask_question" });
  }
  if (allowedCapabilities.includes("view_why_this")) {
    actions.push({
      kind: "why_this",
      label: "Why this?",
      capability: "view_why_this",
    });
  }
  if (has("open")) {
    actions.push({
      kind: "open_full_node",
      label: "Open full node",
      capability: "open",
    });
  }
  if (has("reference")) {
    actions.push({
      kind: "reference",
      label: "Copy reference",
      capability: "reference",
    });
  }
  if (has("open_website") && website) {
    actions.push({
      kind: "open_website",
      label: "Open website",
      capability: "open_website",
      href: website,
    });
  }
  return actions;
}

/** Human-meaningful claims from an object: schema-def fields first, then
 *  any non-internal field. Title/description are identity/summary and are
 *  not repeated here. */
function buildClaims(object: PingObject): SheetClaim[] {
  const def = getSchemaDef(object.schema);
  const defLabels = new Map<string, string>();
  if (def) {
    for (const f of def.fields) defLabels.set(f.name, f.label);
  }
  const claims: SheetClaim[] = [];
  const seen = new Set<string>();
  const push = (name: string, label: string, value: string | string[]) => {
    if (seen.has(name)) return;
    seen.add(name);
    const text = Array.isArray(value) ? value.join(", ") : value;
    if (!text || !text.trim()) return;
    claims.push({
      label,
      value: text,
      claimClass: classifyClaim({
        provenanceKind: object.provenance.kind,
        computed: false,
      }),
      evidenceRef:
        typeof object.fields["evidence_ref"] === "string"
          ? (object.fields["evidence_ref"] as string)
          : undefined,
    });
  };
  // Schema-defined fields first, in schema order (skip title/description).
  if (def) {
    for (const f of def.fields) {
      if (f.name === "title" || f.name === "description") continue;
      const raw = object.fields[f.name];
      if (raw !== undefined) push(f.name, f.label, raw);
    }
  }
  // Then any other non-internal field, alphabetical for determinism.
  const extra = Object.keys(object.fields)
    .filter(
      (k) =>
        k !== "title" &&
        k !== "description" &&
        !INTERNAL_FIELD_KEYS.has(k) &&
        !seen.has(k),
    )
    .sort();
  for (const k of extra) {
    const raw = object.fields[k];
    if (raw === undefined) continue;
    const label = k
      .split("_")
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(" ");
    push(k, label, raw);
  }
  return claims;
}

function typeLabel(schemaId: string): string {
  const def = getSchemaDef(schemaId);
  if (def) return def.label;
  const role = schemaRole(schemaId);
  if (role) return role.charAt(0).toUpperCase() + role.slice(1);
  return "Object";
}

function toEdgeItem(
  rel: PingRelationship,
  target: PingObject,
  label: string,
): EdgeTargetItem {
  return {
    edgeId: rel.id,
    predicate: rel.predicate,
    predicateLabel: label,
    targetObjectId: target.id,
    targetTitle: target.title,
    targetTypeLabel: typeLabel(target.schema),
    kind: resolveEdgeKind(rel.predicate, target.schema),
    evidenceRef: rel.evidenceRef,
    claimClass: "DIRECT_FACT",
  };
}

export interface BuildSheetOptions {
  /** Ask-lane allowed capabilities; defaults to the visitor set. */
  allowedCapabilities?: readonly string[];
}

/**
 * buildObjectSheet: (graph, objectId, viewer) -> ObjectSheet | null.
 *
 * Returns null when the object is absent or invisible to this viewer.
 * The HTTP layer maps null -> 404, indistinguishable from "unknown".
 * The input graph is never mutated.
 */
export function buildObjectSheet(
  graph: ObjectGraph,
  objectId: string,
  viewer: EdgeViewer,
  opts: BuildSheetOptions = {},
): ObjectSheet | null {
  void viewer;
  // THE gate (public visibility). Everything below sees only authorized state.
  const visible = applyPublicVisibilityGate(graph);
  const byId = new Map<string, PingObject>();
  for (const o of visible.objects) byId.set(o.id, o);

  const object = byId.get(objectId);
  if (!object) return null;

  // Outgoing ACTIVE edges only. Incoming edges (e.g. provided_by) are
  // reachable by traversing to the source; the sheet shows the object's
  // own outgoing primary edges.
  const outgoing: PingRelationship[] = [];
  for (const r of visible.relationships) {
    if (r.subject !== objectId) continue;
    if (r.status !== "active") continue;
    if (r.object === objectId) continue; // self-loop is not an edge out
    if (!byId.has(r.object)) continue; // belt: gate already drops these
    outgoing.push(r);
  }

  // Group by predicate, deterministic group order.
  const byPredicate = new Map<string, PingRelationship[]>();
  for (const r of outgoing) {
    const list = byPredicate.get(r.predicate);
    if (list) list.push(r);
    else byPredicate.set(r.predicate, [r]);
  }
  const predicates = Array.from(byPredicate.keys()).sort((a, b) =>
    compareGroupKeys(groupSortKey(a), groupSortKey(b)),
  );

  const edgeGroups: EdgeGroup[] = predicates.map((predicate) => {
    const rels = (byPredicate.get(predicate) as PingRelationship[]).slice();
    const label = predicateLabel(predicate, object.schema);
    const items = rels
      .map((r) => toEdgeItem(r, byId.get(r.object) as PingObject, label))
      // Deterministic: title, then id. Never insertion order.
      .sort((a, b) =>
        a.targetTitle < b.targetTitle
          ? -1
          : a.targetTitle > b.targetTitle
            ? 1
            : a.targetObjectId < b.targetObjectId
              ? -1
              : a.targetObjectId > b.targetObjectId
                ? 1
                : 0,
      );
    // Dominant kind: the kind of the first item (all items in a group
    // usually share it); ties are impossible by construction.
    return {
      predicate,
      label,
      kind: items.length > 0 ? items[0].kind : "generic_edge",
      items,
      totalCount: items.length,
    };
  });

  const allowedCapabilities =
    opts.allowedCapabilities ?? VISITOR_ALLOWED_CAPABILITIES;
  const actions = resolveActions(object, object.schema, allowedCapabilities);

  const summary = object.description || object.title;
  const summaryClaimClass: SheetClaim["claimClass"] = object.description
    ? classifyClaim({ provenanceKind: object.provenance.kind, computed: false })
    : "DERIVED_FACT";

  const evidence: SheetEvidence[] = [];
  const seenRefs = new Set<string>();
  const pushEvidence = (ref: string) => {
    if (!ref || seenRefs.has(ref)) return;
    seenRefs.add(ref);
    evidence.push({
      ref,
      source: object.provenance.ref,
      observedAt: object.provenance.derivedAt,
    });
  };
  pushEvidence(object.provenance.ref);
  const objEvidenceRef = object.fields["evidence_ref"];
  if (typeof objEvidenceRef === "string") pushEvidence(objEvidenceRef);
  for (const g of edgeGroups) {
    for (const item of g.items) pushEvidence(item.evidenceRef);
  }

  const claims = buildClaims(object);
  // Derived-fact claim: the edge-derived neighborhood size. Computed from
  // the authorized graph, labeled as derived, never as direct fact.
  if (edgeGroups.length > 0) {
    const total = edgeGroups.reduce((n, g) => n + g.totalCount, 0);
    claims.push({
      label: "Connected objects",
      value:
        String(total) +
        " across " +
        String(edgeGroups.length) +
        (edgeGroups.length === 1 ? " relationship" : " relationships"),
      claimClass: "DERIVED_FACT",
    });
  }

  return {
    objectId: object.id,
    title: object.title,
    typeLabel: typeLabel(object.schema),
    schemaRole: schemaRole(object.schema),
    summary,
    summaryClaimClass,
    claims,
    edgeGroups,
    actions,
    evidence,
    provenanceRef: object.provenance.ref,
    visibility: "public",
  };
}
