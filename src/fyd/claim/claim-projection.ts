/**
 * FYD claim read projection (claims gate, Nolan 2026-09-25 binding decision).
 *
 * Constitutional distinction: claim EXISTENCE/STATUS may be public; the full
 * internal claim record is NOT the public representation.
 *
 * This is a PROJECTION, not a ClaimAuthority: it performs no state
 * transitions, resolves no identities, grants no capabilities, and consults
 * no relationship. It only shapes an already-loaded ResourceClaim for a
 * viewer kind. The claim state machine (./machine.ts) remains the sole
 * claim authority.
 *
 * The projection respects the product-law seams by never synthesizing
 * across them: the public view carries only business-object-level facts
 * (resource id, kind, status, public source URL). Claimant identity,
 * verification evidence, owner/manager relationship material, and granted
 * capabilities are never derived, summarized, or inferred into the public
 * view; they are shown as stored (owner/internal viewers) or omitted
 * entirely (anonymous viewers).
 *
 * Viewer kinds:
 *   anonymous - unauthenticated public caller. Gets the minimal explicitly
 *               approved public claim view: resourceId, kind, state,
 *               sourceUrl. NOTHING else. In particular: no claimedBy
 *               identity, no verification proof internals, no private
 *               evidence references, no owner/principal identifiers, no
 *               internal workflow state, no internal timestamps, no
 *               capabilities, no audit/journal internals.
 *   owner     - authorized owner context (demo-owner mode on a private
 *               host). Gets the full stored record to manage the claim.
 *   internal  - authorized operational caller. Gets the full stored record.
 *   unknown   - FAIL CLOSED: returns null. Callers must serve no claim
 *               data of any shape on null.
 *
 * Pure and browser-safe: no node imports, no I/O. Never throws.
 */

import type { ClaimState, ResourceClaim } from "./types";

/** Bump when the public view fields or the viewer rules change. */
export const CLAIM_PROJECTION_VERSION = "fyd.claim-projection@1" as const;

export type ClaimViewerKind = "anonymous" | "owner" | "internal" | "unknown";

/**
 * The minimal explicitly approved public claim projection.
 * Any field not listed here is NOT public, no matter what the stored
 * record happens to contain.
 */
export interface PublicClaimView {
  resourceId: string;
  kind: "fyd-site";
  state: ClaimState;
  /** The public URL the resource was observed at, if any. */
  sourceUrl: string | null;
}

/** What a viewer may receive: the public view, or the full stored record. */
export type ProjectedClaim = PublicClaimView | ResourceClaim;

/**
 * Shape a stored claim for a viewer kind. Returns null (fail closed) for
 * unknown viewers and for missing/invalid records.
 */
export function projectClaimForViewer(
  claim: ResourceClaim | null | undefined,
  viewer: ClaimViewerKind,
): ProjectedClaim | null {
  if (!claim || typeof claim !== "object") return null;
  switch (viewer) {
    case "anonymous":
      // Explicit allowlist. Every other stored field stays server-side.
      return {
        resourceId: claim.resourceId,
        kind: claim.kind,
        state: claim.state,
        sourceUrl: claim.sourceUrl,
      };
    case "owner":
    case "internal":
      return claim;
    case "unknown":
    default:
      return null;
  }
}
