/**
 * FYD EDGE-OBJECT EXPERIENCE: types.
 *
 * Law: AN OBJECT IS NOT A CARD. AN OBJECT IS A NODE WITH EDGES.
 * OBJECT -> TAP -> EXPAND -> EDGES APPEAR -> TRAVERSE EDGE -> NEXT OBJECT
 * -> EXPAND / ACT / ASK / RETURN.
 *
 * INVARIANT (binding on every renderer of this module):
 * AN EDGE OBJECT IS NOT SUCCESSFULLY RENDERED UNTIL IT PROVIDES A
 * FUNCTIONAL DOORWAY INTO THE AUTHORIZED BUSINESS GRAPH.
 *
 * Every edge item carries a real target object id. No decorative images,
 * no presentation-only pseudo-objects, no hardcoded business cards, no
 * business-name conditionals. The same code renders Happy Place and
 * Coppersmith; only the graph data differs.
 *
 * Privacy: sheets are built from a viewer-filtered graph (FYD-010
 * filterGraphForViewer). An object the viewer may not see yields null,
 * which the HTTP layer maps to 404, indistinguishable from "unknown".
 * The edge graph is never a privacy bypass.
 *
 * Claim authority: this module creates no claims. Render projection emits
 * only factual bindings whose provenance resolves to graph/evidence or
 * explicit owner-authored content. Every rendered claim carries a
 * ClaimClass; generated marketing copy is labeled GENERATED_COPY and must
 * never masquerade as direct fact.
 */

/** How a claim rendered in the edge experience is classified. */
export type ClaimClass =
  | "DIRECT_FACT" // verbatim source observation (website statement, owner statement)
  | "DERIVED_FACT" // computed from the graph (counts, groupings, summaries)
  | "OWNER_AUTHORED" // explicit owner-authored content, provenance kind owner-*
  | "GENERATED_COPY"; // template/marketing copy produced by the renderer

/**
 * Edge presentation kind. Resolved from (predicate, target schema role),
 * never from business names. UNKNOWN predicates fall through to
 * "generic_edge": a functional generic relationship renderer, never a
 * dead end.
 */
export type EdgeKind =
  | "service_edge"
  | "location_edge"
  | "person_edge"
  | "business_edge"
  | "external_identity_edge"
  | "reference_edge"
  | "generic_edge";

/** One traversable edge item. targetObjectId is ALWAYS a real object id. */
export interface EdgeTargetItem {
  /** Relationship id this item was resolved from. */
  edgeId: string;
  /** Raw predicate, e.g. "offers". */
  predicate: string;
  /** Human label for the predicate, e.g. "Services offered". */
  predicateLabel: string;
  /** REAL object id of the edge target. Never null, never decorative. */
  targetObjectId: string;
  targetTitle: string;
  /** Schema role label, e.g. "Service", "Location", "Business". */
  targetTypeLabel: string;
  kind: EdgeKind;
  /** Edge provenance: why FYD thinks this edge exists. */
  evidenceRef: string;
  /** The edge itself is a claim: website_statement here. */
  claimClass: ClaimClass;
}

/** Edges grouped by predicate: the PRIMARY EDGES of an object sheet. */
export interface EdgeGroup {
  predicate: string;
  /** Human label for the group, e.g. "Services offered". */
  label: string;
  /** Dominant presentation kind of the group's items. */
  kind: EdgeKind;
  /** Items in deterministic order (title, then id). Render-capped by the
   *  client attention limit; totalCount reports the full authorized set. */
  items: EdgeTargetItem[];
  /** Full authorized item count; items.length may be smaller only when the
   *  client caps rendering. The payload carries every authorized item so
   *  progressive disclosure never invents objects. */
  totalCount: number;
}

/** One claim row in the object sheet, classified. */
export interface SheetClaim {
  label: string;
  value: string;
  claimClass: ClaimClass;
  evidenceRef?: string;
}

/**
 * One action the sheet may offer. Actions resolve through the EXISTING
 * capability path (capabilityOptions in sitespec/schemas.ts, intersected
 * with the ask lane's allowedCapabilities). Only actions that actually
 * resolve are rendered: no invented buttons.
 */
export interface SheetAction {
  kind: "ask" | "why_this" | "open_full_node" | "reference" | "open_website";
  label: string;
  /** The resolved capability that authorized this action. */
  capability: string;
  /** Present only for open_website: the safe, validated href. */
  href?: string;
}

/** Evidence backing the sheet's summary. */
export interface SheetEvidence {
  ref: string;
  source: string;
  observedAt: string;
}

/**
 * The compact object sheet: identity, type, evidence-backed summary,
 * primary edges, available actions. Served by GET /api/edge/object and
 * rendered by the edge client as a bottom sheet (mobile) / side panel
 * (desktop).
 */
export interface ObjectSheet {
  objectId: string;
  title: string;
  /** Schema role label: "Business", "Service", "Location", "Person", ... */
  typeLabel: string;
  schemaRole: string | null;
  /** Evidence-backed summary: the object's own description when it is a
   *  verbatim observation, else a derived summary. Never marketing copy
   *  masquerading as fact; see summaryClaimClass. */
  summary: string;
  summaryClaimClass: ClaimClass;
  /** Claim-classified scalar fields. */
  claims: SheetClaim[];
  /** Primary edges, grouped by predicate, deterministic order. */
  edgeGroups: EdgeGroup[];
  /** Capability-resolved actions only. */
  actions: SheetAction[];
  evidence: SheetEvidence[];
  /** Object-level provenance pointer. */
  provenanceRef: string;
  /** Sheets are only ever built for viewers through the visibility gate;
   *  a sheet that exists is public-to-that-viewer by construction. */
  visibility: "public";
}

/**
 * The binding invariant, exported so renderers, tests, and docs reference
 * one canonical string. A render function satisfies it only when the
 * rendered element opens a functional doorway (tap -> sheet -> traverse)
 * into the authorized graph.
 */
export const EDGE_RENDER_INVARIANT =
  "AN EDGE OBJECT IS NOT SUCCESSFULLY RENDERED UNTIL IT PROVIDES A " +
  "FUNCTIONAL DOORWAY INTO THE AUTHORIZED BUSINESS GRAPH.";
