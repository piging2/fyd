/**
 * FYD public projection boundary — SERVER ONLY (node:crypto + owner-store file reads).
 *
 * This module is the single public projection boundary for FYD tenant
 * object graphs (Q-C-01):
 *
 *   Canonical ObjectGraph + Evidence + Owner Decisions + Viewer Policy + Capabilities
 *     -> VerifiedProjection -> every public consumer
 *
 * No public route, page, or loader may serialize tenant object data that
 * has not passed through this boundary. The output type,
 * VerifiedPublicProjection, is branded: public-surface constructors
 * (composeObjectView, buildObjectSheet, buildSemanticRenderModel, the
 * public routes) take the branded type, so feeding an unprojected graph
 * is a compile error, not a code-review hope.
 *
 * This is NOT a new authority. It composes the existing machinery:
 * - source verification + owner value corrections: src/fyd/data/ping-object-source.ts
 *   (the funnel entry points getVerifiedPublicProjection / Sync live there)
 * - deterministic field rules: ./field-visibility.ts (pure, browser-safe core)
 * - durable owner visibility state: ../object/owner-store.ts (readOverrides)
 * - capability grants: the projection records the viewer-scoped grants; the
 *   capability authority stays capabilityOptionsForSchema (./schemas.ts).
 *
 * Composition order (deterministic):
 *   1. verify the source projection + provenance (ping-object-source, before this)
 *   2. compose owner field corrections (ping-object-source, before this)
 *   3. resolve durable owner visibility decisions for every object in the graph
 *   4. apply field visibility (hide / coarse / conservative defaults)
 *   5. apply hide traversal cuts (address-hidden objects lose active edges)
 *   6. filter to public objects and endpoint-safe active relationships (anonymous only)
 *   7. emit the versioned projection receipt (digests, viewer policy, checkpoint)
 *
 * Privacy is projection, not evidence deletion: the source graph and owner
 * evidence are untouched. The owner viewer branch passes the graph through
 * unchanged (owner-authorized context may inspect hidden fields to manage
 * them) but still brands the output and records the owner viewer policy,
 * so the audit trail distinguishes anonymous projections from owner ones.
 */

import { createHash } from "node:crypto";
import { canonicalize } from "@/lib/ping/ask-composer";
import { readOverrides } from "../object/owner-store";
import {
  applyFieldVisibility,
  applyHideTraversal,
  type FieldVisibilityDecision,
} from "./field-visibility";
import type { ObjectGraph } from "./types";

/** Boundary version. Bump when the projection composition order or rules change. */
export const PUBLIC_PROJECTION_VERSION = "fyd.public-projection@1" as const;

/** The only viewer policies the boundary resolves. No per-request auth exists;
 *  public routes use "anonymous"; owner-management lanes use "owner". */
export type PublicViewerKind = "anonymous" | "owner";
export const ANONYMOUS_VIEWER_KIND: PublicViewerKind = "anonymous";
export const OWNER_VIEWER_KIND: PublicViewerKind = "owner";

/**
 * Capability grants resolved at projection time and recorded in the receipt.
 * The capability authority stays capabilityOptionsForSchema (./schemas.ts);
 * these are the viewer-scoped grants the boundary asserts. The visitor set
 * mirrors VISITOR_ALLOWED_CAPABILITIES in ../../edge/resolve.ts (kept as a
 * literal here because that module imports this one for buildObjectSheet's
 * branded parameter; importing it back would be a cycle).
 */
export const ANONYMOUS_CAPABILITIES: readonly string[] = [
  "ask_question",
  "view_evidence",
  "view_why_this",
];
export const OWNER_CAPABILITIES: readonly string[] = [
  ...ANONYMOUS_CAPABILITIES,
  "manage_objects",
  "customize",
  "view_owner_history",
  "view_hidden_fields",
];

/** Versioned projection receipt. The semantic identity of a projection is
 *  (graphDigest, decisionsDigest, viewerPolicyDigest); projectedAt is
 *  operational metadata and is NOT part of the semantic identity. */
export interface PublicProjectionProvenance {
  boundaryVersion: typeof PUBLIC_PROJECTION_VERSION;
  viewerKind: PublicViewerKind;
  /** sha256 hex of canonicalize(source graph before projection). */
  graphDigest: string;
  /** sha256 hex of canonicalize(owner decisions applied). */
  decisionsDigest: string;
  /** sha256 hex of canonicalize({viewerKind, boundaryVersion, decisionsDigest, capabilities}). */
  viewerPolicyDigest: string;
  /** The meaningful snapshot id: `${graphDigest}:${decisionsDigest}`. */
  checkpoint: string;
  capabilities: string[];
  projectedAt: string;
}

/**
 * A tenant object graph that has passed the public projection boundary.
 * Public-surface constructors take this type; raw ObjectGraph values do
 * not satisfy it. The brand is a compile-time discriminant plus a
 * runtime kind check (isVerifiedPublicProjection).
 */
export interface VerifiedPublicProjection {
  readonly kind: typeof PUBLIC_PROJECTION_VERSION;
  graph: ObjectGraph;
  /**
   * The owner decisions the projection was built under, in graph object
   * order. Carried so downstream models (e.g. the semantic render model)
   * record the decisions that actually shaped the graph, not a
   * caller-supplied claim about them.
   */
  decisions: FieldVisibilityDecision[];
  provenance: PublicProjectionProvenance;
}

/** Runtime brand check for defense-in-depth at trust boundaries. */
export function isVerifiedPublicProjection(
  value: unknown,
): value is VerifiedPublicProjection {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === PUBLIC_PROJECTION_VERSION &&
    typeof (value as { graph?: unknown }).graph === "object" &&
    typeof (value as { provenance?: unknown }).provenance === "object"
  );
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Convert durable owner visibility state for one object into canonical
 * field-visibility decisions. Extends the existing owner-store reads;
 * it does NOT invent new durable state.
 *
 * Current coverage: addressVisibility hidden/coarse (the durable states
 * the owner store supports). Arbitrary field hide/coarse decisions have
 * no durable writer yet (open product gap); this function must not
 * invent them.
 */
export function objectDecisionsToFieldVisibility(
  objectId: string,
): FieldVisibilityDecision[] {
  const overrides = readOverrides(objectId);
  const decisions: FieldVisibilityDecision[] = [];
  // Durable owner state is addressVisibility: "public" | "hidden" plus the
  // addressVisibilityAssertion carrying the OwnerAssertion contract (with a
  // durable `at` timestamp). decidedAt comes from durable state, never from
  // the wall clock, so the decisions digest is replay-deterministic.
  if (overrides.addressVisibility === "hidden") {
    decisions.push({
      objectId,
      field: "address",
      policy: "hide",
      decidedBy: "owner",
      decidedAt:
        overrides.addressVisibilityAssertion?.at ?? overrides.updatedAt,
      source: "owner_override",
      version: 1,
    });
  }
  return decisions;
}

/**
 * Resolve the owner visibility decisions for every object in a graph.
 * Deterministic given the owner store state; order follows graph object order.
 */
export function decisionsForGraph(graph: ObjectGraph): FieldVisibilityDecision[] {
  const decisions: FieldVisibilityDecision[] = [];
  for (const obj of graph.objects) {
    decisions.push(...objectDecisionsToFieldVisibility(obj.id));
  }
  return decisions;
}

/**
 * Run one verified projection. Pure with respect to its inputs (the only
 * I/O is node:crypto hashing); the caller supplies the source-verified
 * graph and the resolved owner decisions.
 *
 * The input graph is never mutated: the transform chain works on a
 * structured clone.
 */
export function verifyPublicProjection(
  graph: ObjectGraph,
  decisions: FieldVisibilityDecision[],
  viewerKind: PublicViewerKind,
): VerifiedPublicProjection {
  const graphDigest = sha256Hex(canonicalize(graph));
  const policySubset = decisions.map((d) => ({
    objectId: d.objectId,
    field: d.field,
    policy: d.policy,
    version: d.version,
  }));
  const decisionsDigest = sha256Hex(canonicalize(policySubset));
  const capabilities =
    viewerKind === "owner" ? [...OWNER_CAPABILITIES] : [...ANONYMOUS_CAPABILITIES];
  const viewerPolicyDigest = sha256Hex(
    canonicalize({
      viewerKind,
      boundaryVersion: PUBLIC_PROJECTION_VERSION,
      decisionsDigest,
      capabilities,
    }),
  );

  let projected: ObjectGraph;
  if (viewerKind === "anonymous") {
    const source = structuredClone(graph);
    const afterFields = applyFieldVisibility(source, decisions);
    const afterTraversal = applyHideTraversal(afterFields, decisions);
    const visibleIds = new Set(
      afterTraversal.objects.filter((o) => o.visibility === "public").map((o) => o.id),
    );
    projected = {
      objects: afterTraversal.objects.filter((o) => visibleIds.has(o.id)),
      relationships: afterTraversal.relationships.filter(
        (r) => r.status === "active" && visibleIds.has(r.subject) && visibleIds.has(r.object),
      ),
    };
  } else {
    // Owner-authorized: full visibility so the owner can manage hidden
    // fields/objects. Still branded, still receipted, still auditable.
    projected = structuredClone(graph);
  }

  return {
    kind: PUBLIC_PROJECTION_VERSION,
    graph: projected,
    decisions,
    provenance: {
      boundaryVersion: PUBLIC_PROJECTION_VERSION,
      viewerKind,
      graphDigest,
      decisionsDigest,
      viewerPolicyDigest,
      checkpoint: `${graphDigest}:${decisionsDigest}`,
      capabilities,
      projectedAt: new Date().toISOString(),
    },
  };
}

