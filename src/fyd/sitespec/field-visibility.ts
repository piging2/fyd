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
 * HOUSE-NUMBER SIGNAL (Q-P0-01): a text segment leads with a house number
 * when it starts with digits followed by whitespace ("123 Main St").
 * Business names ("Acme Plumbing") and city names ("Grand Junction") do
 * not; street lines do. This is the deliberately conservative street
 * detector: it is biased toward catching addresses (fail closed on
 * privacy) at the cost of occasionally flagging a non-address value that
 * happens to lead with digits. That outcome is lossy but never a privacy
 * leak.
 */
function hasHouseNumberLead(text: string): boolean {
  return /^\d+\s/.test(text.trim());
}

/**
 * Whole-value street test: a house number followed by street words with
 * no commas, e.g. "123 Main St" (the schema.org streetAddress shape).
 */
function isStreetShaped(value: string): boolean {
  return /^\d+\s+\w/.test(value.trim());
}

/**
 * VALUE-SHAPE RULE (Q-P0-01): a field value is address-shaped when any
 * comma-separated segment starts with a house number, or when the whole
 * value matches the street pattern. The check is name-independent: it is
 * what lets a street address hiding in a field named "location" (not
 * "address") be treated as an address anyway, and what lets the Ask
 * composer's located_at branch coarsen an address-shaped location TITLE.
 * Pure, deterministic, no I/O, no clock.
 */
export function valueLooksLikeAddress(value: string | string[]): boolean {
  const text = Array.isArray(value) ? value.join(", ") : value;
  const segments = text.split(",").map((s) => s.trim());
  if (segments.some((s) => hasHouseNumberLead(s))) return true;
  return isStreetShaped(text);
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
 *
 * VALUE-SHAPE DEFAULT (Q-P0-01 leak 3): when the field's value is
 * provided, an address-shaped VALUE also defaults to "coarse" regardless
 * of the field name — a street address in a field named "location" is not
 * exempt just because the name lacks "address". Triggers only on the
 * strong house-number street signal (valueLooksLikeAddress); everything
 * else defaults to "show". Owner decisions still win over this default.
 */
export function resolveFieldVisibility(
  objectId: string,
  field: string,
  decisions: FieldVisibilityDecision[],
  value?: string | string[],
): { policy: FieldVisibilityPolicy; source: VisibilitySource } {
  let best: FieldVisibilityDecision | undefined;
  for (const d of decisions) {
    if (d.objectId !== objectId || d.field !== field) continue;
    if (best === undefined || d.version >= best.version) best = d;
  }
  if (best !== undefined) {
    return { policy: best.policy, source: "owner_override" };
  }
  if (field.toLowerCase().includes("address")) {
    return { policy: "coarse", source: "conservative_default" };
  }
  if (value !== undefined && valueLooksLikeAddress(value)) {
    return { policy: "coarse", source: "conservative_default" };
  }
  return { policy: "show", source: "conservative_default" };
}

/**
 * COARSEN RULE: split the value on commas and drop the street-level
 * segment; city/region/postal survives.
 *
 * - Multi-segment: if the FIRST comma segment starts with a house number
 *   (/^\d+\s/) it is the street segment — drop it before keeping the last
 *   two segments. Without this, a single-comma value such as
 *   "123 Main St, Grand Junction CO 81501" keeps its street inside the
 *   kept last-two segments. (Q-P0-01 leak 1)
 * - Multi-segment without a street lead: keep the last two segments,
 *   trimmed, rejoined with ", ".
 * - Single-segment: the value may BE the street segment (the schema.org
 *   streetAddress shape, e.g. "123 Main St"). It cannot be coarsened, so
 *   fail closed: suppress it to "". A non-street single value
 *   ("Grand Junction") returns unchanged. (Q-P0-01 leak 2)
 *
 * Example: "123 Main St, Grand Junction, CO 81501" -> "Grand Junction, CO 81501".
 * Deterministic, pure, no I/O.
 */
export function coarsenAddress(value: string): string {
  const segments = value.split(",").map((s) => s.trim());
  if (segments.length < 2) {
    return isStreetShaped(value) ? "" : value;
  }
  const head = segments[0] ?? "";
  const rest = hasHouseNumberLead(head) ? segments.slice(1) : segments;
  return rest.slice(-2).join(", ");
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
      const { policy } = resolveFieldVisibility(o.id, key, decisions, value);
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
