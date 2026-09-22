/**
 * SEMANTIC DIFF: the twin diff engine.
 *
 * Given a source change (old vs new SOURCE-layer object graphs), compute:
 *   1. which objects and claims changed (added, removed, visibility,
 *      provenance claim, fields),
 *   2. affected projections: dependency-manifest bindings reached through
 *      the reverse walk, at object-field granularity and at claim-ref
 *      (evidence) granularity,
 *   3. the owner-override conflict check: does the new source collide with
 *      an OWNER-layer assertion or an OwnerIntent constraint. Conflicts are
 *      surfaced, never silently applied. The diff carries them and proposes
 *      review or drift-record actions. It never proposes overwriting owner
 *      state, and the owner layer is read-only here.
 *   4. a list of proposed regeneration actions: typed, deterministic, and
 *      sorted. No LLM inside. The same inputs produce the same diff, byte
 *      for byte.
 *
 * Four non-overwriting layers: SOURCE is this engine input, OWNER (intent
 * plus corrections) is read and never written, GENERATED and PROJECTION
 * are downstream consumers of the proposed actions.
 *
 * Boundary: the object builder decides WHAT is known (verification plus
 * attestation). This engine decides WHAT CHANGED and WHAT IT TOUCHES. Any
 * non-empty change set proposes reverify-graph first, so the builder
 * re-attests the new source before any regeneration consumes it.
 *
 * Volatile stamps (createdAt, updatedAt, derivedAt) are not semantic:
 * timestamp-only movement produces no change entry.
 */

import type {
  PingObject,
  PingRelationship,
  OwnerFieldCorrection,
} from "@/lib/ping/types";
import type { ObjectGraph } from "../sitespec/types";
import type { BindingClassification } from "../sitespec/graph";
import {
  reverseWalk,
  type DependencyManifest,
  type BindingManifest,
} from "./manifest";
import {
  normalizeOwnerIntent,
  resolveOperatingConstraints,
  OPERATING_CONSTRAINT_COMPONENTS,
  type OwnerIntent,
} from "./owner-intent";

export const SEMANTIC_DIFF_VERSION = "fyd-semantic-diff@1";

/** One owner-attested field correction, pinned to the object it corrects. */
export interface OwnerAssertion {
  objectId: string;
  correction: OwnerFieldCorrection;
}

export interface TwinDiffInput {
  tenantId: string;
  /** SOURCE layer before the change. */
  oldGraph: ObjectGraph;
  /** SOURCE layer after the change, re-derived upstream by the intake seam. */
  newGraph: ObjectGraph;
  /** Dependency manifest of the current projection. */
  manifest: DependencyManifest;
  /** Owner intent. Normalized defensively on the way in. */
  intent: OwnerIntent;
  /** OWNER-layer field corrections. Read, never written. */
  ownerAssertions: OwnerAssertion[];
}

export type ObjectChangeKind =
  | "added"
  | "removed"
  | "visibility-changed"
  | "provenance-changed"
  | "fields-changed";

/**
 * One object carries at most one change entry: the highest-priority kind
 * wins (removed, added, visibility-changed, provenance-changed,
 * fields-changed). Claim-level and object-level impact are both still
 * walked for affected bindings, so no impact is lost to the priority.
 */
const OBJECT_KIND_PRIORITY: Record<ObjectChangeKind, number> = {
  "removed": 0,
  "added": 1,
  "visibility-changed": 2,
  "provenance-changed": 3,
  "fields-changed": 4,
};

export interface ObjectChange {
  objectId: string;
  kind: ObjectChangeKind;
  /**
   * Changed names for fields-changed: "title", "description", or field
   * keys. Sorted. Empty for the other kinds.
   */
  fields: string[];
  /** Claim refs for provenance-changed. Also recorded on added/removed. */
  claimRefBefore: string | null;
  claimRefAfter: string | null;
}

export type RelationshipChangeKind =
  | "added"
  | "removed"
  | "status-changed"
  | "endpoints-changed";

export interface RelationshipChange {
  relationshipId: string;
  kind: RelationshipChangeKind;
  predicate: string;
  subject: string;
  object: string;
  /** Claim refs when the leg evidenceRef moved (endpoints-changed). */
  evidenceRefBefore: string | null;
  evidenceRefAfter: string | null;
}

export type OwnerConflictKind =
  | "prohibited-positioning"
  | "owner-override-collision"
  | "operating-constraint-collision";

export interface OwnerConflict {
  kind: OwnerConflictKind;
  /**
   * Canonical conflict identity, for example
   * "prohibited-positioning/biz-1", "owner-override/biz-1/phone",
   * "operating-constraint/home:CTA:0". Doubles as the action target.
   */
  key: string;
  objectId: string | null;
  bindingId: string | null;
  /** The intent rule or owner assertion that blocks silent application. */
  blockedBy: string;
  /** Human-readable account of the collision. */
  detail: string;
}

export interface AffectedBinding {
  bindingId: string;
  component: string;
  objectField: string;
  claimRef: string | null;
  classification: BindingClassification;
  ownerPolicy: "owner-wins" | "source-only";
  /** Why this binding was flagged. */
  reason: string;
}

export type RegenerationActionKind =
  | "no-op"
  | "reverify-graph"
  | "review-owner-conflict"
  | "record-source-drift"
  | "regenerate-binding";

/**
 * Execution order, lowest first: re-attest the graph, resolve conflicts
 * with the owner, record drift, then regenerate presentation. Review
 * actions always sort before regenerate actions, so a conflict gates
 * regeneration of the surface it touches.
 */
const ACTION_RANK: Record<RegenerationActionKind, number> = {
  "no-op": 0,
  "reverify-graph": 1,
  "review-owner-conflict": 2,
  "record-source-drift": 3,
  "regenerate-binding": 4,
};

export interface RegenerationAction {
  kind: RegenerationActionKind;
  /** What the action targets: tenant, graph, conflict key, or binding id. */
  target: string;
  reason: string;
}

export interface SemanticDiff {
  version: typeof SEMANTIC_DIFF_VERSION;
  tenantId: string;
  /** True when any object or relationship changed. */
  changed: boolean;
  hasConflicts: boolean;
  objectChanges: ObjectChange[];
  relationshipChanges: RelationshipChange[];
  affectedBindings: AffectedBinding[];
  conflicts: OwnerConflict[];
  actions: RegenerationAction[];
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function fieldKey(v: string | string[]): string {
  return Array.isArray(v) ? "arr:" + v.join(",") : "str:" + v;
}

/** Sorted names of fields whose values differ. */
function compareFieldMaps(
  a: Record<string, string | string[]>,
  b: Record<string, string | string[]>,
): string[] {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const changed: string[] = [];
  for (const k of keys) {
    const av = a[k];
    const bv = b[k];
    if (av === undefined || bv === undefined) {
      changed.push(k);
      continue;
    }
    if (fieldKey(av) !== fieldKey(bv)) changed.push(k);
  }
  return changed;
}

function claimRefOf(o: PingObject): string | null {
  const ref = o.provenance ? o.provenance.ref : "";
  return typeof ref === "string" && ref.length > 0 ? ref : null;
}

function evidenceRefOf(r: PingRelationship): string | null {
  const ref = r.evidenceRef;
  return typeof ref === "string" && ref.length > 0 ? ref : null;
}

/**
 * Compare one object present in both graphs. Returns null when nothing
 * semantic changed. When several aspects changed at once, the
 * highest-priority kind wins (see OBJECT_KIND_PRIORITY).
 */
function compareObjects(oldO: PingObject, newO: PingObject): ObjectChange | null {
  const base = {
    objectId: newO.id,
    fields: [] as string[],
    claimRefBefore: claimRefOf(oldO),
    claimRefAfter: claimRefOf(newO),
  };
  const candidates: ObjectChangeKind[] = [];
  if (oldO.visibility !== newO.visibility) candidates.push("visibility-changed");
  if (claimRefOf(oldO) !== claimRefOf(newO)) candidates.push("provenance-changed");
  const fields: string[] = [];
  if (oldO.title !== newO.title) fields.push("title");
  if (oldO.description !== newO.description) fields.push("description");
  for (const f of compareFieldMaps(oldO.fields, newO.fields)) fields.push(f);
  if (fields.length > 0) candidates.push("fields-changed");
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => OBJECT_KIND_PRIORITY[a] - OBJECT_KIND_PRIORITY[b]);
  const kind = candidates[0];
  return { ...base, kind, fields: kind === "fields-changed" ? fields.sort() : [] };
}

/** Compare one relationship present in both graphs. */
function compareRelationships(
  oldR: PingRelationship,
  newR: PingRelationship,
): RelationshipChange | null {
  const base = {
    relationshipId: newR.id,
    predicate: newR.predicate,
    subject: newR.subject,
    object: newR.object,
    evidenceRefBefore: evidenceRefOf(oldR),
    evidenceRefAfter: evidenceRefOf(newR),
  };
  if (oldR.status !== newR.status) {
    return { ...base, kind: "status-changed" };
  }
  if (
    oldR.subject !== newR.subject ||
    oldR.object !== newR.object ||
    oldR.predicate !== newR.predicate ||
    evidenceRefOf(oldR) !== evidenceRefOf(newR)
  ) {
    return { ...base, kind: "endpoints-changed" };
  }
  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Prohibited-positioning matching. Same semantics as the evidence-binding
 * verifier in generated-presentation.ts: case-insensitive, word-boundary
 * match so "best" does not fire inside "bestiality", while multi-word
 * phrases match as substrings. Returns every predicate hit, in the order
 * the prohibited list names them.
 */
function findProhibitedPredicates(text: string, prohibited: string[]): string[] {
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const p of prohibited) {
    const needle = p.toLowerCase().trim();
    if (needle === "") continue;
    const pattern = new RegExp(
      "(^|[^a-z0-9])" + escapeRegExp(needle) + "([^a-z0-9]|$)",
    );
    if (pattern.test(lower) && !hits.includes(p)) hits.push(p);
  }
  return hits;
}

/** Source text scanned for prohibited positioning: title, description, fields. */
function sourceTexts(o: PingObject): string[] {
  const texts: string[] = [o.title, o.description];
  for (const k of Object.keys(o.fields).sort()) {
    const v = o.fields[k];
    texts.push(Array.isArray(v) ? v.join(", ") : v);
  }
  return texts;
}

/**
 * Current source value of a correctable field ("phone", "email",
 * "website"). Null when the object or the field is absent from source.
 */
function correctionFieldCurrent(o: PingObject | undefined, field: string): string | null {
  if (!o) return null;
  const v = o.fields[field];
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.join(",");
  return null;
}

/** Invert the operating-constraint table: component -> constraints. Sorted. */
function componentConstraints(): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const constraint of Object.keys(OPERATING_CONSTRAINT_COMPONENTS).sort()) {
    for (const component of OPERATING_CONSTRAINT_COMPONENTS[constraint]) {
      const list = m.get(component) ?? [];
      list.push(constraint);
      m.set(component, list);
    }
  }
  for (const list of m.values()) list.sort();
  return m;
}

/**
 * Compute the twin diff. Pure and deterministic: the same input graphs,
 * manifest, intent, and assertions always produce the same diff.
 */
export function diffTwin(input: TwinDiffInput): SemanticDiff {
  const intent = normalizeOwnerIntent(input.intent);
  const oldById = new Map(input.oldGraph.objects.map((o) => [o.id, o]));
  const newById = new Map(input.newGraph.objects.map((o) => [o.id, o]));
  const oldRelById = new Map(input.oldGraph.relationships.map((r) => [r.id, r]));
  const newRelById = new Map(input.newGraph.relationships.map((r) => [r.id, r]));

  // ---- 1. object changes ----
  const objectChanges: ObjectChange[] = [];
  const objectIds = [...new Set([...oldById.keys(), ...newById.keys()])].sort();
  for (const id of objectIds) {
    const o = oldById.get(id);
    const n = newById.get(id);
    if (o && !n) {
      objectChanges.push({
        objectId: id,
        kind: "removed",
        fields: [],
        claimRefBefore: claimRefOf(o),
        claimRefAfter: null,
      });
    } else if (!o && n) {
      objectChanges.push({
        objectId: id,
        kind: "added",
        fields: [],
        claimRefBefore: null,
        claimRefAfter: claimRefOf(n),
      });
    } else if (o && n) {
      const c = compareObjects(o, n);
      if (c) objectChanges.push(c);
    }
  }

  // ---- 2. relationship changes ----
  const relationshipChanges: RelationshipChange[] = [];
  const relIds = [...new Set([...oldRelById.keys(), ...newRelById.keys()])].sort();
  for (const id of relIds) {
    const o = oldRelById.get(id);
    const n = newRelById.get(id);
    if (o && !n) {
      relationshipChanges.push({
        relationshipId: id,
        kind: "removed",
        predicate: o.predicate,
        subject: o.subject,
        object: o.object,
        evidenceRefBefore: evidenceRefOf(o),
        evidenceRefAfter: null,
      });
    } else if (!o && n) {
      relationshipChanges.push({
        relationshipId: id,
        kind: "added",
        predicate: n.predicate,
        subject: n.subject,
        object: n.object,
        evidenceRefBefore: null,
        evidenceRefAfter: evidenceRefOf(n),
      });
    } else if (o && n) {
      const c = compareRelationships(o, n);
      if (c) relationshipChanges.push(c);
    }
  }

  // ---- 3. affected bindings: object-field and claim-ref reverse walks ----
  const affected = new Map<string, AffectedBinding>();
  const flagBinding = (b: BindingManifest, reason: string) => {
    const prev = affected.get(b.bindingId);
    if (prev) {
      prev.reason = prev.reason + "; " + reason;
      return;
    }
    affected.set(b.bindingId, {
      bindingId: b.bindingId,
      component: b.component,
      objectField: b.objectField,
      claimRef: b.claimRef,
      classification: b.classification,
      ownerPolicy: b.ownerPolicy,
      reason,
    });
  };
  const walkSorted = (query: string): BindingManifest[] =>
    reverseWalk(input.manifest, query)
      .slice()
      .sort((a, b) => cmp(a.bindingId, b.bindingId));

  const describeObjectChange = (c: ObjectChange): string => {
    const base = "object \"" + c.objectId + "\" " + c.kind;
    return c.kind === "fields-changed" ? base + " [" + c.fields.join(", ") + "]" : base;
  };
  for (const c of objectChanges) {
    for (const b of walkSorted(c.objectId)) {
      flagBinding(b, describeObjectChange(c));
    }
  }

  // Claim-level impact: a changed claim ref touches every binding bound to
  // the old or the new ref, even when the object id does not match.
  const claimQueries = new Map<string, string>();
  const addClaimQuery = (ref: string | null, why: string) => {
    if (ref === null) return;
    const prev = claimQueries.get(ref);
    claimQueries.set(ref, prev ? prev + "; " + why : why);
  };
  for (const c of objectChanges) {
    if (c.kind === "provenance-changed" || c.kind === "added" || c.kind === "removed") {
      addClaimQuery(c.claimRefBefore, "claim of " + describeObjectChange(c) + " (before)");
      addClaimQuery(c.claimRefAfter, "claim of " + describeObjectChange(c) + " (after)");
    }
  }
  for (const c of relationshipChanges) {
    if (c.kind === "endpoints-changed" && c.evidenceRefBefore !== c.evidenceRefAfter) {
      addClaimQuery(c.evidenceRefBefore, "evidence of relationship \"" + c.relationshipId + "\" (before)");
      addClaimQuery(c.evidenceRefAfter, "evidence of relationship \"" + c.relationshipId + "\" (after)");
    }
  }
  for (const ref of [...claimQueries.keys()].sort()) {
    for (const b of walkSorted(ref)) {
      flagBinding(b, "claim \"" + ref + "\" changed (" + (claimQueries.get(ref) ?? "") + ")");
    }
  }
  const affectedBindings = [...affected.values()].sort((a, b) => cmp(a.bindingId, b.bindingId));

  // ---- 4. owner conflicts: surfaced, never silently applied ----
  const conflicts: OwnerConflict[] = [];
  const changedIds = new Set(
    objectChanges.filter((c) => c.kind !== "removed").map((c) => c.objectId),
  );
  const removedIds = new Set(
    objectChanges.filter((c) => c.kind === "removed").map((c) => c.objectId),
  );

  // 4a. Prohibited positioning: new or changed source text collides with an
  // OwnerIntent predicate. Scoped to the change: pre-existing text on
  // untouched objects is the planner and verifier business, not this diff.
  for (const id of [...changedIds].sort()) {
    const o = newById.get(id);
    if (!o) continue;
    const hits = new Set<string>();
    for (const text of sourceTexts(o)) {
      for (const p of findProhibitedPredicates(text, intent.prohibitedPositioning)) {
        hits.add(p);
      }
    }
    if (hits.size === 0) continue;
    const predicates = [...hits].sort();
    conflicts.push({
      kind: "prohibited-positioning",
      key: "prohibited-positioning/" + id,
      objectId: id,
      bindingId: null,
      blockedBy: predicates.map((p) => "prohibited-positioning:\"" + p + "\"").join(", "),
      detail:
        "new source text on \"" + id + "\" contains prohibited positioning (" +
        predicates.join(", ") +
        "): surfaced for owner review, never presented silently.",
    });
  }

  // 4b. Owner-override collisions: the source moved under an OWNER-layer
  // correction, or the source removed the object or field the owner
  // corrected. The owner value still wins. The drift is recorded so the
  // movement is visible instead of silent.
  const assertionsByObject = new Map<string, OwnerFieldCorrection[]>();
  for (const a of input.ownerAssertions) {
    const list = assertionsByObject.get(a.objectId) ?? [];
    list.push(a.correction);
    assertionsByObject.set(a.objectId, list);
  }
  const driftedIds = new Set([...changedIds, ...removedIds]);
  for (const id of [...assertionsByObject.keys()].sort()) {
    if (!driftedIds.has(id)) continue;
    const n = newById.get(id);
    const corrections = (assertionsByObject.get(id) ?? [])
      .slice()
      .sort((a, b) => cmp(a.field, b.field));
    for (const correction of corrections) {
      const current = correctionFieldCurrent(n, correction.field);
      if (current === correction.sourceValue) continue;
      const key = "owner-override/" + id + "/" + correction.field;
      const sourceDesc = n
        ? "source \"" + correction.field + "\" moved from \"" +
          (correction.sourceValue ?? "<absent>") + "\" to \"" +
          (current ?? "<absent>") + "\""
        : "source removed object \"" + id + "\"";
      conflicts.push({
        kind: "owner-override-collision",
        key,
        objectId: id,
        bindingId: null,
        blockedBy: "owner-correction:\"" + id + "\".\"" + correction.field + "\"",
        detail:
          sourceDesc + " under an owner correction (owner value \"" +
          correction.ownerValue + "\" still wins): drift recorded, owner layer untouched.",
      });
    }
  }

  // 4c. Operating-constraint collisions: the source change touches a
  // binding whose component an honored operating constraint removed.
  // Unknown constraints never collide: they are recorded, not applied.
  const removedComponents = new Set(resolveOperatingConstraints(intent.operatingConstraints).removed);
  const compConstraints = componentConstraints();
  for (const ab of affectedBindings) {
    if (!removedComponents.has(ab.component)) continue;
    const names = (compConstraints.get(ab.component) ?? []).sort();
    conflicts.push({
      kind: "operating-constraint-collision",
      key: "operating-constraint/" + ab.bindingId,
      objectId: null,
      bindingId: ab.bindingId,
      blockedBy: names.map((c) => "operating-constraint:\"" + c + "\"").join(", "),
      detail:
        "source change touches binding \"" + ab.bindingId + "\" (" + ab.component +
        "), which honored operating constraints remove (" + names.join(", ") +
        "): surfaced for owner review, component stays removed.",
    });
  }
  conflicts.sort((a, b) => cmp(a.key, b.key));

  // ---- 5. proposed regeneration actions: typed, deterministic, sorted ----
  const actions: RegenerationAction[] = [];
  const hasChanges = objectChanges.length > 0 || relationshipChanges.length > 0;
  if (!hasChanges && conflicts.length === 0) {
    actions.push({
      kind: "no-op",
      target: input.tenantId,
      reason: "no source changes and no owner conflicts",
    });
  } else {
    if (hasChanges) {
      actions.push({
        kind: "reverify-graph",
        target: "graph:" + input.tenantId,
        reason:
          objectChanges.length + " object change(s), " +
          relationshipChanges.length + " relationship change(s): the object " +
          "builder must re-attest before regeneration",
      });
    }
    for (const c of conflicts) {
      if (c.kind === "owner-override-collision") {
        actions.push({
          kind: "record-source-drift",
          target: c.key,
          reason:
            "source moved under an owner correction: the owner value still " +
            "wins, the drift is recorded for review",
        });
      } else {
        actions.push({
          kind: "review-owner-conflict",
          target: c.key,
          reason:
            c.kind === "prohibited-positioning"
              ? "new source text collides with prohibited positioning: owner " +
                "decision required before presentation"
              : "source change touches content removed by an honored operating " +
                "constraint: owner decision required",
        });
      }
    }
    // Bindings on constraint-removed components are NOT proposed for
    // regeneration: their review action above is the gate.
    const blockedBindings = new Set(
      conflicts
        .filter((c) => c.kind === "operating-constraint-collision" && c.bindingId)
        .map((c) => c.bindingId as string),
    );
    for (const ab of affectedBindings) {
      if (blockedBindings.has(ab.bindingId)) continue;
      actions.push({
        kind: "regenerate-binding",
        target: ab.bindingId,
        reason: "binding affected by source change (" + ab.reason + ")",
      });
    }
  }
  actions.sort(
    (a, b) => ACTION_RANK[a.kind] - ACTION_RANK[b.kind] || cmp(a.target, b.target),
  );

  return {
    version: SEMANTIC_DIFF_VERSION,
    tenantId: input.tenantId,
    changed: hasChanges,
    hasConflicts: conflicts.length > 0,
    objectChanges,
    relationshipChanges,
    affectedBindings,
    conflicts,
    actions,
  };
}

/** Render the diff as a Markdown report. */
export function renderSemanticDiffReport(d: SemanticDiff): string {
  const lines: string[] = [];
  lines.push("# Semantic diff: " + d.tenantId);
  lines.push("");
  lines.push("- engine: " + d.version);
  lines.push("- source changed: **" + (d.changed ? "YES" : "NO") + "**");
  lines.push("- owner conflicts: **" + (d.hasConflicts ? "YES (" + d.conflicts.length + ")" : "NO") + "**");
  lines.push("");
  lines.push("## Object changes (" + d.objectChanges.length + ")");
  if (d.objectChanges.length === 0) lines.push("- none");
  for (const c of d.objectChanges) {
    let line = "- " + c.kind + " \"" + c.objectId + "\"";
    if (c.kind === "fields-changed") line += " [" + c.fields.join(", ") + "]";
    if (c.kind === "provenance-changed") {
      line += " claim \"" + (c.claimRefBefore ?? "<absent>") + "\" -> \"" + (c.claimRefAfter ?? "<absent>") + "\"";
    }
    lines.push(line);
  }
  lines.push("");
  lines.push("## Relationship changes (" + d.relationshipChanges.length + ")");
  if (d.relationshipChanges.length === 0) lines.push("- none");
  for (const c of d.relationshipChanges) {
    lines.push(
      "- " + c.kind + " \"" + c.relationshipId + "\" " + c.subject + " -[" +
        c.predicate + "]-> " + c.object,
    );
  }
  lines.push("");
  lines.push("## Affected bindings (" + d.affectedBindings.length + ")");
  if (d.affectedBindings.length === 0) lines.push("- none");
  for (const b of d.affectedBindings) {
    lines.push(
      "- \"" + b.bindingId + "\" (" + b.component + ", " + b.classification +
        ", " + b.ownerPolicy + "): " + b.reason,
    );
  }
  lines.push("");
  lines.push("## Owner conflicts (" + d.conflicts.length + ")");
  if (d.conflicts.length === 0) lines.push("- none");
  for (const c of d.conflicts) {
    lines.push("- [" + c.kind + "] " + c.key);
    lines.push("  - blocked by: " + c.blockedBy);
    lines.push("  - " + c.detail);
  }
  lines.push("");
  lines.push("## Proposed actions (" + d.actions.length + ")");
  for (const a of d.actions) {
    lines.push("- " + a.kind + " -> " + a.target + ": " + a.reason);
  }
  lines.push("");
  return lines.join("\n");
}
