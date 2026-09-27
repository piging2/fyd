/**
 * FYD-010: the Ask FYD context-projection boundary.
 *
 * Enforces: CANONICAL CONTEXT -> VIEWER + VISIBILITY + CAPABILITY ->
 * SANITIZED CONTEXT PROJECTION -> ASK FYD.
 *
 * This module owns the SANITIZED CONTEXT PROJECTION step. It is the single
 * choke point between canonical objects and the model input: every caller
 * of buildAskFydContext passes through it, including the lineage tracer
 * (which feeds raw fixture objects as an anonymous viewer).
 *
 * Two separate concerns, kept separate on purpose:
 *
 * 1. classifyAskViewer: WHO the viewer is. "owner" requires a verified
 *    identity (verified === true from a bound OwnerIdentityProvider).
 *    Everything else, anonymous, unknown, demo, practice session,
 *    unverified id, is "visitor". Fail closed. In particular, the Ask
 *    pipeline's mode string, demo owner constructs, and query parameters
 *    can NEVER produce the owner class: they are not verification.
 *
 * 2. projectAskContextForViewer: WHAT the model may receive. One strict
 *    pipeline for every viewer class: owner visibility decisions first
 *    (hide drops, address-likes coarsen), then the FYD-Q2 hide traversal
 *    cut, then FYD-Q1 conflict suppression, then public objects only,
 *    then the visitor-safe field allowlist on every surviving object,
 *    then active relationships whose endpoints both survived.
 *
 * The model is never an owner: private values are excluded from the model
 * context for EVERY viewer class, including a verified owner. An owner
 * reads private data through owner surfaces (the overrides UI), never
 * through the model. This is the lane's explicit zero-canary rule, and it
 * is why the projection does not widen for the owner class: the
 * classification exists so a future authenticated lane has a verified
 * hook, and so tests can prove unverified "owner" claims grant nothing.
 *
 * Pure, deterministic, no I/O. Never mutates its inputs.
 */

import {
  applyFieldVisibility,
  applyHideTraversal,
  type FieldVisibilityDecision,
} from "../sitespec/field-visibility";
import {
  type AskFieldConflict,
  isUnresolvedConflict,
  suppressConflictedFields,
} from "./field-conflicts";
import type { AskViewerClass, AskViewerIdentity } from "./types";
import { visitorSafeObject } from "./visitor-safe-fields";
import type { ObjectGraph } from "../sitespec/types";

/**
 * Classify an Ask FYD viewer. "owner" if and only if the viewer carries a
 * verified identity: verified === true AND a non-empty id. Every other
 * shape, null, undefined, anonymous, unknown id, demo, practice, falls
 * through to "visitor". There is no third class and no elevation path that
 * does not go through verification.
 */
export function classifyAskViewer(
  viewer: AskViewerIdentity | null | undefined,
): AskViewerClass {
  if (
    viewer !== null &&
    viewer !== undefined &&
    viewer.verified === true &&
    typeof viewer.id === "string" &&
    viewer.id.length > 0
  ) {
    return "owner";
  }
  return "visitor";
}

export interface ProjectedAskContext {
  viewerClass: AskViewerClass;
  graph: ObjectGraph;
}

/**
 * Project a canonical object graph to the sanitized graph the Ask FYD
 * model may receive for this viewer. The pipeline:
 *
 *   1. applyFieldVisibility(graph, decisions): owner HIDE decisions drop
 *      fields; address-like fields coarsen; everything else shows.
 *   2. applyHideTraversal: a hidden address fact cannot leak via
 *      located_at traversal (FYD-Q2).
 *   3. suppressConflictedFields: unresolved conflicts suppress the
 *      contested value (FYD-Q1).
 *   4. keep public objects only.
 *   5. visitorSafeObject on every surviving object: the field allowlist is
 *      the fail-closed floor. Unknown field names are dropped, never
 *      passed through, for every viewer class.
 *   6. keep active relationships whose subject and object both survived.
 *
 * The input graph is never mutated.
 */
export function projectAskContextForViewer(
  graph: ObjectGraph,
  viewer: AskViewerIdentity | null | undefined,
  decisions: FieldVisibilityDecision[] = [],
  conflicts: AskFieldConflict[] = [],
): ProjectedAskContext {
  const viewerClass = classifyAskViewer(viewer);
  const projected = applyFieldVisibility(graph, decisions);
  const traversed = applyHideTraversal(projected, decisions);
  const suppressed = suppressConflictedFields(
    traversed,
    conflicts.filter(isUnresolvedConflict),
  );
  const safeObjects = suppressed.objects
    .filter((o) => o.visibility === "public")
    .map(visitorSafeObject);
  const safeIds = new Set(safeObjects.map((o) => o.id));
  const safeRelationships = suppressed.relationships.filter(
    (r) => r.status === "active" && safeIds.has(r.subject) && safeIds.has(r.object),
  );
  return { viewerClass, graph: { objects: safeObjects, relationships: safeRelationships } };
}
