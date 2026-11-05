/**
 * Render seam for the FYD objects economic loop (lane B4;
 * DESIGN.md component D). SERVER ONLY: this module reads the loop
 * stores through the matching provider and must never be imported
 * into a client bundle.
 *
 * A participating surface composes through here. The seam has
 * exactly three outcomes:
 *
 *   1. Loop disabled, or the requesting tenant/surface is not the
 *      loop's one participating pair: the caller's ranked candidates
 *      pass through organically and the matching provider is NEVER
 *      invoked (no decision records, no loop reads). This is what
 *      makes the flag-off render byte-identical to the unwired
 *      render.
 *   2. Loop enabled for the loop surface: the B3 provider evaluates
 *      (it never throws and persists its decisions before
 *      returning); an eligible placement rides its item as the
 *      display context's sponsorship, so the EXISTING presentation
 *      path renders the Sponsored disclosure chip.
 *   3. Any unexpected failure in the seam itself: organic-only.
 *      The loop can never break or block a publisher page.
 *
 * The organic passthrough applies the rank composition's own
 * organic rule (suppressed candidates dropped, first occurrence
 * wins, limit applied) so outcome 1 and a no-placement outcome 2
 * produce the same item list for the same candidates.
 */

import { randomUUID } from "node:crypto";
import type { RankedCandidate } from "../rank/object-ranker";
import type { ObjectEventContext } from "../rank/object-events";
import type {
  EligibleSponsoredPlacement,
  ObjectPlacement,
} from "../rank/sponsored-placement";
import type { ObjectDisplayContext } from "../presentation/object-context";
import type { AdsEventLedger } from "./event-ledger";
import {
  isAdsLoopEnabled,
  LOOP_PUBLISHER_TENANT_ID,
  LOOP_SURFACE,
} from "./policy";
import { evaluateComposition } from "./provider";

export interface LoopSurfaceCompositionRequest {
  /** Publisher tenant scope, resolved from the caller's identity. */
  publisherTenantId: string;
  surface: string;
  /** Opaque authorized viewer/session scope, never a browsing identity. */
  viewerScopeRef: string;
  /** The surface's ranked organic candidates (the ranker's output). */
  candidates: readonly RankedCandidate[];
  /** Composition limit from the caller's render context. */
  limit: number;
  /** Evaluation instant (epoch ms); default Date.now. */
  now?: number;
  /** Ledger override (tests); default a fresh AdsEventLedger. */
  ledger?: AdsEventLedger;
  /** Environment override (tests); default process.env. */
  env?: Readonly<Record<string, string | undefined>>;
  /** Id minter override (tests); default crypto.randomUUID. */
  mintId?: () => string;
}

export interface LoopSurfaceItem {
  objectId: string;
  candidate: RankedCandidate;
  /** The eligible placement riding this item, or null for organic. */
  sponsorship: EligibleSponsoredPlacement | null;
  /**
   * The context the existing presentation components consume. Set
   * only for the sponsored item: an organic item carries no display
   * context at all, exactly as an unwired render would pass none.
   */
  displayContext: ObjectDisplayContext | null;
  /** Decision record id for the sponsored item; null otherwise. */
  decisionId: string | null;
  /**
   * Collector context for the sponsored item (its render instance
   * awaits visibility samples); null for organic items, which the
   * loop does not collect.
   */
  eventContext: ObjectEventContext | null;
}

export interface LoopSurfaceComposition {
  items: LoopSurfaceItem[];
  sponsored: {
    placement: EligibleSponsoredPlacement;
    decisionId: string;
  } | null;
  /** True when the matching provider was invoked for this request. */
  providerInvoked: boolean;
  /** One correlation id for the whole composition (page render). */
  correlationId: string;
}

/** The rank composition's organic rule, mirrored for the passthrough. */
function organicPlacements(
  candidates: readonly RankedCandidate[],
  limit: number,
): ObjectPlacement[] {
  const seen = new Set<string>();
  const remaining = candidates.filter((candidate) => {
    if (candidate.suppression !== undefined || seen.has(candidate.objectId)) {
      return false;
    }
    seen.add(candidate.objectId);
    return true;
  });
  const capacity = Number.isInteger(limit) && limit >= 0 ? limit : 0;
  return remaining
    .slice(0, capacity)
    .map((candidate) => ({ candidate, sponsorship: null }));
}

export function composeLoopSurfaceComposition(
  request: LoopSurfaceCompositionRequest,
): LoopSurfaceComposition {
  const mintId = request.mintId ?? (() => randomUUID());
  const correlationId = mintId();
  const enabled = isAdsLoopEnabled(request.env);
  const participating =
    request.publisherTenantId === LOOP_PUBLISHER_TENANT_ID &&
    request.surface === LOOP_SURFACE;

  let placements: ObjectPlacement[];
  let sponsored: LoopSurfaceComposition["sponsored"] = null;
  let providerInvoked = false;

  if (enabled && participating) {
    providerInvoked = true;
    try {
      const result = evaluateComposition({
        publisherTenantId: request.publisherTenantId,
        surface: request.surface,
        viewerScopeRef: request.viewerScopeRef,
        candidates: request.candidates,
        limit: request.limit,
        now: request.now,
        ledger: request.ledger,
      });
      placements = result.placements;
      sponsored = result.sponsored;
    } catch {
      // The provider contract is never-throw; if that contract is
      // ever broken, the render still degrades to organic-only.
      placements = organicPlacements(request.candidates, request.limit);
      sponsored = null;
    }
  } else {
    placements = organicPlacements(request.candidates, request.limit);
  }

  const sponsoredPlacementId = sponsored?.placement.placementId ?? null;
  const sponsoredDecisionId = sponsored?.decisionId ?? null;
  const items: LoopSurfaceItem[] = placements.map((placement) => {
    const renderInstanceId = mintId();
    const isSponsored =
      sponsoredPlacementId !== null &&
      placement.sponsorship !== null &&
      placement.sponsorship.placementId === sponsoredPlacementId;
    return {
      objectId: placement.candidate.objectId,
      candidate: placement.candidate,
      sponsorship: placement.sponsorship,
      displayContext: placement.sponsorship
        ? { surface: request.surface, sponsorship: placement.sponsorship }
        : null,
      decisionId: isSponsored ? sponsoredDecisionId : null,
      eventContext: isSponsored
        ? {
            objectId: placement.candidate.objectId,
            surface: request.surface,
            correlationId,
            renderInstanceId,
            authorizedActor: { sessionId: request.viewerScopeRef },
            sponsorship: placement.sponsorship,
          }
        : null,
    };
  });

  return { items, sponsored, providerInvoked, correlationId };
}
