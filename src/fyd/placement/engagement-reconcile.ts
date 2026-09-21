/**
 * Engagement/placement reconciliation (pure, deterministic).
 *
 * Invariant: engagement state must always be consistent with current
 * geometry. Placement is derived continuously from available safe
 * geometry (the rail rule, the peripheral slot manager, ...), so the
 * derived placement mode can change at any time: viewport resize, chrome
 * appearing or disappearing, content reflow.
 *
 * When the derived placement mode changes while a Circle is engaged, the
 * engagement MUST be released: the Circle collapses back to launcher
 * state and no stale or invisible interactive surface survives the
 * transition. The host (rail client, PortalHost, ...) owns the actual
 * release; this module only makes the decision, so the policy stays
 * unit-testable without a DOM.
 *
 * This module never changes the frozen placement rule
 * (src/fyd/placement/rail-rule.ts); it only reconciles engagement with
 * whatever mode the rule (or the slot manager) derived.
 */

/** Opaque placement-mode token. Only equality matters here. */
export type PlacementMode = string;

export interface PlacementSnapshot {
  engagedId: string;
  mode: PlacementMode;
}

export interface ReconcileDecision {
  /** The engaged id to release (collapse to launcher), or null to keep. */
  releaseEngagedId: string | null;
}

/**
 * Decide whether a placement derivation requires releasing engagement.
 *
 * - next is null (nothing engaged) -> keep.
 * - prev is null (first derivation) -> keep; nothing to reconcile against.
 * - engaged id changed (the user moved engagement to another Circle) ->
 *   keep; the switch itself is intentional, not a geometry event.
 * - same id, mode changed -> release. This is the defect being fixed:
 *   RAIL -> COLLAPSED (or slot lost / slot moved) while engaged.
 * - same id, same mode -> keep. A resize that does not move the placement
 *   must not kill engagement by itself.
 */
export function reconcileEngagementOnModeChange(
  prev: PlacementSnapshot | null,
  next: PlacementSnapshot | null,
): ReconcileDecision {
  if (next === null) return { releaseEngagedId: null };
  if (prev === null) return { releaseEngagedId: null };
  if (prev.engagedId !== next.engagedId) return { releaseEngagedId: null };
  if (prev.mode === next.mode) return { releaseEngagedId: null };
  return { releaseEngagedId: next.engagedId };
}
