/**
 * Rail placement rule (pure, deterministic).
 *
 * Decides which peripheral margin hosts the portal side rail, given the
 * free horizontal whitespace outside the content column. Placement only:
 * it never touches object semantics, canonical objects, SiteSpec, Ask
 * FYD, the capability model, or portal internals.
 *
 * The caller measures the margins from the live DOM (see
 * src/app/portal-rail/metrics.ts) and passes them in; this function only
 * applies the decision policy.
 */

/** Side the rail lands on. "none" collapses the placement strategy. */
export type RailSide = "left" | "right" | "none";

/** Margins within this many px of each other count as a tie: right wins. */
export const RAIL_TIE_BAND_PX = 24;

/**
 * Choose the rail side from measured free margins.
 *
 * - If neither margin reaches minSafe, return "none": the placement
 *   strategy collapses and nothing renders. Margins are never faked.
 * - Otherwise the side with the greatest safe whitespace wins.
 * - Margins within RAIL_TIE_BAND_PX of each other are a tie; right wins.
 *
 * Negative inputs are clamped to 0: a margin cannot be less than none.
 */
export function chooseRailSide(
  leftFree: number,
  rightFree: number,
  minSafe = 88,
): RailSide {
  const left = Math.max(0, leftFree);
  const right = Math.max(0, rightFree);
  const leftOk = left >= minSafe;
  const rightOk = right >= minSafe;
  if (!leftOk && !rightOk) return "none";
  if (leftOk && !rightOk) return "left";
  if (rightOk && !leftOk) return "right";
  if (Math.abs(left - right) <= RAIL_TIE_BAND_PX) return "right";
  return left > right ? "left" : "right";
}
