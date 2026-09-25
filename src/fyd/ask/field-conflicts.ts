/**
 * Ask FYD field-conflict model (FYD-Q1, Nolan 2026-09-24, locked).
 *
 * Fail-closed conflict handling:
 * - Both observations survive in the evidence; neither is silently
 *   promoted. The conflict belongs to the evidence layer.
 * - The projection policy (visitor-answer publicGraphOf) suppresses the
 *   contested field value, so the composer can never select a disputed
 *   value.
 * - Public copy is fixed: "Contact information is being verified." The
 *   answer describes the field as unresolved/unknown; internal evidence
 *   mechanics (e.g. "requested verification") never surface.
 *
 * This module defines the conflict record shape and the projection-side
 * suppression. It does NOT detect conflicts: detection belongs to the
 * lane that observes disagreement (builder semantic-diff, journal). The
 * ask lane honors a declared conflict list, fail-closed.
 *
 * Pure + deterministic. No loader, no network, no clock.
 */

import type { ObjectGraph } from "../sitespec/types";

/** One observation of a contested field. The value is carried for evidence
 *  identity only: it is NEVER rendered into a public answer while the
 *  conflict is unresolved. */
export interface AskFieldConflictObservation {
  /** The observed value. Withheld from public answers while unresolved. */
  value: string;
  /** Provenance kind, e.g. "website-ingestion", "canonical-journal",
   *  "owner-correction", "owner-authored". */
  provenanceKind: string;
  /** Provenance ref, e.g. "website-ingestion:https://example.com/". */
  provenanceRef: string;
  /** ISO-8601 derivation time, when known. */
  derivedAt?: string;
}

/**
 * A declared field conflict. status "unresolved" suppresses the field in
 * the public projection and drives the "being verified" copy. status
 * "resolved" is inert: the resolved value lives in the graph itself.
 */
export interface AskFieldConflict {
  objectId: string;
  field: string;
  status: "unresolved" | "resolved";
  /** Both evidence chains. Never empty for an unresolved conflict. */
  observations: AskFieldConflictObservation[];
}

/** True when the conflict suppresses the field in public answers. */
export function isUnresolvedConflict(c: AskFieldConflict): boolean {
  return c.status === "unresolved";
}

/**
 * Project a NEW ObjectGraph with unresolved-conflict fields suppressed.
 * Never mutates the input: objects whose fields change get fresh field
 * records; everything else is shared by reference. The source graph keeps
 * both observations for owner-authorized contexts.
 */
export function suppressConflictedFields(
  graph: ObjectGraph,
  conflicts: AskFieldConflict[],
): ObjectGraph {
  const unresolved = conflicts.filter(isUnresolvedConflict);
  if (unresolved.length === 0) return graph;
  const byObject = new Map<string, Set<string>>();
  for (const c of unresolved) {
    let set = byObject.get(c.objectId);
    if (!set) {
      set = new Set<string>();
      byObject.set(c.objectId, set);
    }
    set.add(c.field);
  }
  const objects = graph.objects.map((o) => {
    const hidden = byObject.get(o.id);
    if (!hidden || hidden.size === 0) return o;
    const fields: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(o.fields)) {
      if (hidden.has(key)) continue;
      fields[key] = value;
    }
    return { ...o, fields };
  });
  return { objects, relationships: graph.relationships };
}

/**
 * Evidence-ref id for one conflict observation. The index is positional
 * in the conflict's observations array. The value is never embedded.
 */
export function conflictObservationRefId(
  conflict: AskFieldConflict,
  index: number,
): string {
  return `${conflict.objectId}#${conflict.field}#conflict-${index}`;
}

/** Parse a conflict observation ref id back to its coordinates. */
export function parseConflictObservationRefId(
  id: string,
): { objectId: string; field: string; index: number } | null {
  const m = /^(.*)#([^#]+)#conflict-(\d+)$/.exec(id);
  if (!m) return null;
  return { objectId: m[1], field: m[2], index: Number(m[3]) };
}
