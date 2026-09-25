/**
 * Margin object selection: graph -> eligibility -> contextual selection -> projection.
 *
 * The production feed for MarginObjectLayer (Nolan 2026-09-25: the layer
 * was built and unit-tested but never mounted; the ?objectDebug=1 gate is
 * not the production path). Pure, deterministic, browser-safe: no DOM, no
 * network, no secrets.
 *
 * Pipeline:
 *   1. ELIGIBILITY: affordanceEligible (canonical roles: service, product,
 *      person, location) over the public graph. Deterministic first; no AI.
 *   2. CONTEXTUAL SELECTION: each eligible object anchors to the FIRST
 *      page section (in render order) whose resolved query contains it.
 *      Objects with no containing section are skipped: no contextual
 *      anchor, no doorway.
 *   3. PROJECTION: PingObject -> MarginObjectDescriptor. Every field is
 *      evidence-backed or null (fail closed); nothing is invented.
 */

import type { PingObject } from "@/lib/ping/types";
import type { FYDPage, ObjectGraph } from "@/fyd/sitespec/types";
import { affordanceEligible } from "@/fyd/components/object-affordance";
import { resolveQuery } from "@/fyd/components/renderer";
import { schemaRole } from "@/fyd/sitespec/schemas";
import { resolveSafeLink } from "@/fyd/sitespec/safe-link";
import { predicateLabel } from "@/fyd/edge/resolve";
import type { MarginObjectDescriptor, RelatedObject } from "./types";

/** Lower places first in the margin; ties break by anchor Y, then objectId. */
const ROLE_PRIORITY: Record<string, number> = {
  service: 0,
  product: 1,
  person: 2,
  location: 3,
};

function rolePriority(o: PingObject): number {
  const role = schemaRole(o.schema);
  return role !== null && role in ROLE_PRIORITY ? ROLE_PRIORITY[role] : 4;
}

/** Evidence-backed canonical website URL, or null (fail closed). */
function safeWebsiteUrl(o: PingObject): string | null {
  const raw = o.fields["website"];
  if (typeof raw !== "string") return null;
  const r = resolveSafeLink(raw, "navigate");
  return r.kind === "safe" ? r.href : null;
}

/**
 * Related objects for the expanded card's peer-jump links. Outgoing
 * ACTIVE edges to public objects only; deterministic order; bounded.
 * Every entry is a real graph edge: never decorative, never invented.
 */
function relatedObjects(o: PingObject, graph: ObjectGraph): RelatedObject[] {
  const byId = new Map(graph.objects.map((x) => [x.id, x]));
  const out: RelatedObject[] = [];
  for (const r of graph.relationships) {
    if (r.subject !== o.id) continue;
    if (r.status !== "active") continue;
    if (r.object === o.id) continue;
    const t = byId.get(r.object);
    if (!t) continue;
    const kind = predicateLabel(r.predicate, o.schema);
    out.push({ objectId: t.id, name: t.title, kind, basis: kind });
  }
  out.sort((a, b) =>
    a.kind < b.kind
      ? -1
      : a.kind > b.kind
        ? 1
        : a.name < b.name
          ? -1
          : a.name > b.name
            ? 1
            : a.objectId < b.objectId
              ? -1
              : a.objectId > b.objectId
                ? 1
                : 0,
  );
  return out.slice(0, 8);
}


/**
 * Word-boundary trim for the whyHere line. Identical logic to trimTagline
 * in @/fyd/object/view, inlined here because view.ts statically imports
 * the server-only media chain (circle-background -> bundle-media ->
 * node:fs/node:path), which webpack cannot bundle into the client
 * component graph (build break, Nolan 2026-09-25). Pure: no DOM, no I/O.
 */
function trimTagline(summary: string, maxChars: number): string {
  const s = summary.trim();
  if (s.length <= maxChars) return s;
  const cut = s.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
}

function toDescriptor(
  o: PingObject,
  anchorKey: string,
  siteId: string,
  graph: ObjectGraph,
): MarginObjectDescriptor {
  const role = schemaRole(o.schema);
  return {
    objectId: o.id,
    name: o.title,
    imageSrc: null,
    imageSrcSet: null,
    websiteUrl: safeWebsiteUrl(o),
    anchorKey,
    priority: rolePriority(o),
    relationships: relatedObjects(o, graph),
    category: null,
    location: role === "location" ? o.title : null,
    whyHere: o.description ? trimTagline(o.description, 90) || null : null,
    shortDescription: null,
    siteId: siteId || null,
  };
}

export interface MarginSelectInput {
  /** Public-visibility graph (the same graph the page renders). */
  graph: ObjectGraph;
  /** Active page: section order is the contextual selection order. */
  page: FYDPage;
  /** Owner object id, for section query resolution. */
  ownerId: string;
  /** Tenant site id, carried into descriptors for the Ask path. */
  siteId: string;
}

/**
 * selectMarginObjects: (graph, page, ownerId, siteId) -> MarginObjectDescriptor[].
 *
 * Deterministic: the same inputs always produce the same descriptors in
 * the same order. Never invents objects, anchors, or copy.
 */
export function selectMarginObjects({
  graph,
  page,
  ownerId,
  siteId,
}: MarginSelectInput): MarginObjectDescriptor[] {
  // Contextual selection: the first section (page order) whose resolved
  // query contains the object wins the anchor. Eligibility gates entry.
  const anchorFor = new Map<string, string>();
  const objectById = new Map(graph.objects.map((o) => [o.id, o]));
  for (const section of page.sections) {
    const objs = resolveQuery(section.query, graph, ownerId);
    for (const o of objs) {
      if (!anchorFor.has(o.id) && affordanceEligible(o)) {
        anchorFor.set(o.id, section.id);
      }
    }
  }
  const sectionIndex = new Map(page.sections.map((s, i) => [s.id, i]));
  const descriptors: MarginObjectDescriptor[] = [];
  for (const [objectId, anchorKey] of anchorFor) {
    const o = objectById.get(objectId);
    if (!o) continue; // belt: resolveQuery only returns graph members
    descriptors.push(toDescriptor(o, anchorKey, siteId, graph));
  }
  descriptors.sort(
    (a, b) =>
      (sectionIndex.get(a.anchorKey) ?? 0) -
        (sectionIndex.get(b.anchorKey) ?? 0) ||
      a.priority - b.priority ||
      (a.objectId < b.objectId ? -1 : a.objectId > b.objectId ? 1 : 0),
  );
  return descriptors;
}
