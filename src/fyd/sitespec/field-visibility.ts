/**
 * FYD owner field-visibility override: the bounded address control.
 *
 * INTEGRATION POINT (site routes are frozen; not wired): the site page
 * should call applyFieldVisibility(sourceGraph, ownerDecisions) and pass
 * the PROJECTED graph to generateSiteSpec/render, keeping the SOURCE graph
 * untouched for the next ingest. The four layers stay distinct and
 * non-overwriting: SOURCE STATE (discovered value) -> OWNER STATE
 * (decisions, this file) -> GENERATED STATE (SiteSpec) ->
 * PROJECTION STATE (render). Owner decisions live OUTSIDE the graph, so a
 * clean re-ingest (fresh SOURCE STATE) plus re-applying the same decisions
 * reproduces the owner's intent: source re-ingestion cannot erase owner
 * visibility intent.
 *
 * Concepts: DISCOVERED VALUE (what the source says), VISIBILITY DEFAULT
 * (what FYD conservatively recommends), OWNER VISIBILITY POLICY (what the
 * owner actually chose). Owner policy wins when permissible. One bounded
 * control: the address case. No privacy-settings UI, no policy engine.
 *
 * Pure, deterministic, browser-safe. No dependencies beyond types.
 */

import type { PingObject } from "@/lib/ping/types";
import type { ObjectGraph } from "./types";

/** What the owner allows for one object field. */
export type FieldVisibilityPolicy = "show" | "hide" | "coarse";

/** Where a resolved visibility came from. */
export type VisibilitySource = "owner_override" | "conservative_default";

/**
 * One owner decision. Semantics per decision: object/field, visibility
 * policy, decision source, actor, timestamp/version. The owner is the only
 * actor in this bounded control; only owner_override decisions exist here.
 */
export interface FieldVisibilityDecision {
  objectId: string;
  field: string;
  policy: FieldVisibilityPolicy;
  decidedBy: "owner";
  decidedAt: string; // ISO 8601
  source: "owner_override";
  version: number;
}

/**
 * Resolve the visibility for one object field.
 *
 * An owner decision for the exact objectId+field wins; the highest version
 * wins (ties resolve to the later decision, deterministically).
 *
 * Conservative default table otherwise: address-bearing fields are the one
 * case FYD will not show verbatim by default. A field whose name contains
 * "address" (case-insensitive; covers "address", "streetaddress",
 * "street_address", "address_locality", ...) defaults to "coarse".
 * Every other field defaults to "show".
 */
export function resolveFieldVisibility(
  objectId: string,
  field: string,
  decisions: FieldVisibilityDecision[],
): { policy: FieldVisibilityPolicy; source: VisibilitySource } {
  let best: FieldVisibilityDecision | undefined;
  for (const d of decisions) {
    if (d.objectId !== objectId || d.field !== field) continue;
    if (best === undefined || d.version >= best.version) best = d;
  }
  if (best !== undefined) {
    return { policy: best.policy, source: "owner_override" };
  }
  const policy: FieldVisibilityPolicy = field.toLowerCase().includes("address")
    ? "coarse"
    : "show";
  return { policy, source: "conservative_default" };
}

/**
 * COARSEN RULE: split the value on commas, keep the last two segments,
 * trim each, and rejoin with ", ". The street-level detail (the first
 * segment) is dropped; city/region/postal survives.
 * Example: "123 Main St, Grand Junction, CO 81501" -> "Grand Junction, CO 81501".
 * Deterministic. Fewer than two segments -> the value is returned unchanged.
 */
export function coarsenAddress(value: string): string {
  const segments = value.split(",").map((s) => s.trim());
  if (segments.length < 2) return value;
  return segments.slice(-2).join(", ");
}

/**
 * Project a NEW ObjectGraph with owner visibility decisions applied.
 * Never mutates the input: the returned graph is a fresh record, each
 * object is a fresh record with a REBUILT fields record; every other
 * object property and the relationships array are shared by reference.
 * Only fields records are rebuilt. SOURCE STATE stays intact for the next
 * ingest; this output is PROJECTION input.
 */
export function applyFieldVisibility(
  graph: ObjectGraph,
  decisions: FieldVisibilityDecision[],
): ObjectGraph {
  const objects: PingObject[] = graph.objects.map((o) => {
    const fields: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(o.fields)) {
      const { policy } = resolveFieldVisibility(o.id, key, decisions);
      if (policy === "hide") continue; // drop the field
      if (policy === "coarse") {
        const joined = Array.isArray(value) ? value.join(", ") : value;
        fields[key] = coarsenAddress(joined);
      } else {
        fields[key] = value;
      }
    }
    return { ...o, fields };
  });
  return { objects, relationships: graph.relationships };
}
