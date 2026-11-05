/**
 * Matching provider for the FYD objects economic loop (lane B3;
 * DESIGN.md component C, BOOTSTRAP-SURGE-OBJECTS-LOOP-DESIGN-
 * 20261104). Per composition request on a participating surface,
 * server-side, this provider:
 *
 *   1. loads the requesting publisher's slots for the surface and
 *      every campaign that names the surface (system assembly,
 *      mirroring the ledger's own reference resolution);
 *   2. drops any slot without ACTIVE consent before the rank
 *      contract is even invoked (the loop's own law), recording the
 *      gate outcome as a placement decision;
 *   3. constructs the PlacementAuthoritySnapshot: decision "allowed"
 *      only when the campaign is live and consent is active, budget
 *      derived solely from COUNTED ledger rows for the UTC day
 *      against the campaign record's own caps (counts, never money),
 *      decisionRef pointing at the decision record this evaluation
 *      persists;
 *   4. constructs the ObjectExposureWindow from the ledger read API;
 *   5. invokes evaluateSponsoredPlacement and composeObjectPlacements
 *      from src/fyd/rank/ UNCHANGED, with policy.ts constants;
 *   6. persists a PlacementDecision for every evaluation (inputs and
 *      outcome, never the branded projection as authority) BEFORE
 *      returning, because the ledger's coverage check reads those
 *      records at ingest.
 *
 * The provider NEVER throws to its caller: render must degrade to
 * organic-only, so any internal failure yields no placement, with
 * the failure class recorded in a decision record whenever one can
 * be written. Deterministic: identical store and ledger state at
 * the same evaluation instant yields the identical composition and
 * the identical decision records.
 */

import {
  composeObjectPlacements,
  evaluateSponsoredPlacement,
  type EligibleSponsoredPlacement,
  type ObjectExposureWindow,
  type ObjectPlacement,
  type PlacementAuthoritySnapshot,
  type PlacementContext,
  type SponsoredPlacement,
} from "../rank/sponsored-placement";
import type { RankedCandidate } from "../rank/object-ranker";
import {
  CAMPAIGN_ENTITY_KIND,
  projectCampaign,
  toSponsoredPlacement,
  type CampaignState,
} from "./campaign-store";
import {
  adsDigest,
  mintPlacementDecisionId,
  writePlacementDecision,
  type PlacementDecisionRecord,
} from "./decision-store";
import { AdsEventLedger } from "./event-ledger";
import { listAdsEntityIds, readAdsEvents } from "./event-log";
import { listSlots, type SlotState } from "./inventory-store";
import {
  budgetScopeRef,
  sponsoredPlacementPolicy,
  utcDayKey,
} from "./policy";

const CAMPAIGNS_SUBDIR = "campaigns";

export interface AdsCompositionRequest {
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
}

export interface AdsEvaluationSummary {
  decisionId: string;
  slotId: string | null;
  campaignId: string | null;
  placementId: string | null;
  eligible: boolean;
  /** Named rejection when ineligible (evaluator, consent gate, or "provider-error"). */
  reason?: string;
  includedInComposition: boolean;
}

export interface AdsCompositionResult {
  /** The full composition: organic candidates with sponsorship marked. */
  placements: ObjectPlacement[];
  /** The one sponsored placement in the composition, when any, with its decision. */
  sponsored: {
    placement: EligibleSponsoredPlacement;
    decisionId: string;
  } | null;
  /** One summary per persisted placement decision, in evaluation order. */
  evaluations: AdsEvaluationSummary[];
}

/**
 * All campaign projections, unscoped: the matcher is a system
 * authority assembling snapshots, not a tenant read (the same
 * posture as the ledger's reference resolution). A campaign becomes
 * a candidate only for surfaces it names, and can only win a slot
 * the requesting publisher owns with active consent.
 */
function listAllCampaignStates(): CampaignState[] {
  const out: CampaignState[] = [];
  for (const id of listAdsEntityIds(CAMPAIGNS_SUBDIR)) {
    const state = projectCampaign(
      readAdsEvents(CAMPAIGNS_SUBDIR, CAMPAIGN_ENTITY_KIND, id),
    );
    if (state !== null) out.push(state);
  }
  return out.sort((a, b) => (a.campaignId < b.campaignId ? -1 : 1));
}

function failureParts(err: unknown): { failureClass: string; failureCode?: string } {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return {
      failureClass: err.name,
      ...(typeof code === "string" ? { failureCode: code } : {}),
    };
  }
  return { failureClass: "UnknownError" };
}

function writeQuietly(record: PlacementDecisionRecord): void {
  try {
    writePlacementDecision(record);
  } catch {
    // A decision that cannot be persisted must never break render;
    // the summary still reports the evaluation honestly.
  }
}

function failureRecord(input: {
  surface: string;
  publisherTenantId: string;
  slotId: string | null;
  campaignId: string | null;
  payerId: string | null;
  evaluatedAt: number;
  err: unknown;
}): PlacementDecisionRecord {
  const { failureClass, failureCode } = failureParts(input.err);
  const inputsDigest = adsDigest({
    failureClass,
    surface: input.surface,
    slotId: input.slotId,
    campaignId: input.campaignId,
  });
  const decisionId = mintPlacementDecisionId({
    slotId: input.slotId,
    campaignId: input.campaignId,
    surface: input.surface,
    evaluatedAt: input.evaluatedAt,
    inputsDigest,
  });
  return {
    decisionId,
    evaluatedAt: input.evaluatedAt,
    surface: input.surface,
    slotId: input.slotId,
    campaignId: input.campaignId,
    publisherTenantId: input.publisherTenantId,
    payerId: input.payerId,
    authoritySnapshot: null,
    exposureWindow: null,
    inputsDigest,
    evaluation: {
      eligible: false,
      reason: "provider-error",
      failureClass,
      ...(failureCode ? { failureCode } : {}),
    },
    composition: { included: false },
  };
}

function summaryOf(
  record: PlacementDecisionRecord,
  placementId: string | null,
): AdsEvaluationSummary {
  return {
    decisionId: record.decisionId,
    slotId: record.slotId,
    campaignId: record.campaignId,
    placementId,
    eligible: record.evaluation.eligible,
    ...(record.evaluation.eligible
      ? {}
      : { reason: record.evaluation.reason }),
    includedInComposition: record.composition?.included ?? false,
  };
}

/** compose's own capacity arithmetic, for naming a share-cap exclusion. */
function compositionCapacity(
  candidates: readonly RankedCandidate[],
  limit: number,
): number {
  const seen = new Set<string>();
  let count = 0;
  for (const c of candidates) {
    if (c.suppression !== undefined || seen.has(c.objectId)) continue;
    seen.add(c.objectId);
    count += 1;
  }
  return Math.min(limit, count);
}

interface PendingEvaluation {
  record: PlacementDecisionRecord;
  placement: SponsoredPlacement;
}

/**
 * Evaluate one composition request. Never throws: the worst case is
 * an organic-only composition with no sponsored placement.
 */
export function evaluateComposition(
  request: AdsCompositionRequest,
): AdsCompositionResult {
  const now =
    typeof request.now === "number" && Number.isFinite(request.now)
      ? request.now
      : Date.now();
  try {
    return evaluateCompositionInner(request, now);
  } catch {
    // Outermost guard: even composition itself failed. Degrade to a
    // plain organic slice; render must never break on this loop.
    try {
      const limit =
        Number.isInteger(request.limit) && request.limit > 0
          ? request.limit
          : 0;
      return {
        placements: request.candidates
          .slice(0, limit)
          .map((candidate) => ({ candidate, sponsorship: null })),
        sponsored: null,
        evaluations: [],
      };
    } catch {
      return { placements: [], sponsored: null, evaluations: [] };
    }
  }
}

function evaluateCompositionInner(
  request: AdsCompositionRequest,
  now: number,
): AdsCompositionResult {
  const policy = sponsoredPlacementPolicy();
  const ledger = request.ledger ?? new AdsEventLedger();
  const baseContext: PlacementContext = {
    surface: request.surface,
    now,
    viewerScopeRef: request.viewerScopeRef,
    policy,
    authorities: [],
    exposures: [],
  };

  let slots: SlotState[];
  let campaigns: CampaignState[];
  try {
    slots = listSlots(request.publisherTenantId).filter(
      (s) => s.surface === request.surface && !s.retired,
    );
    campaigns = listAllCampaignStates().filter((c) =>
      c.surfaces.includes(request.surface),
    );
  } catch (err) {
    // Assembly-level failure: one failure record, organic-only out.
    const record = failureRecord({
      surface: request.surface,
      publisherTenantId: request.publisherTenantId,
      slotId: null,
      campaignId: null,
      payerId: null,
      evaluatedAt: now,
      err,
    });
    writeQuietly(record);
    return {
      placements: composeObjectPlacements(
        request.candidates,
        [],
        baseContext,
        request.limit,
      ),
      sponsored: null,
      evaluations: [summaryOf(record, null)],
    };
  }

  const pending: PendingEvaluation[] = [];
  const records: PlacementDecisionRecord[] = [];
  const authorities: PlacementAuthoritySnapshot[] = [];
  const exposures: ObjectExposureWindow[] = [];
  const sponsoredCandidates: SponsoredPlacement[] = [];

  for (const slot of slots) {
    for (const campaign of campaigns) {
      let placement: SponsoredPlacement;
      try {
        placement = toSponsoredPlacement(campaign, request.surface);
      } catch (err) {
        const record = failureRecord({
          surface: request.surface,
          publisherTenantId: request.publisherTenantId,
          slotId: slot.slotId,
          campaignId: campaign.campaignId,
          payerId: campaign.payerId,
          evaluatedAt: now,
          err,
        });
        records.push(record);
        continue;
      }

      // The loop's consent gate, before the rank contract (DESIGN C.2).
      if (!slot.consentActive) {
        const reason =
          slot.consent === null
            ? "consent-missing"
            : slot.consent.revokedAt !== null
              ? "consent-revoked"
              : "consent-inactive";
        const inputsDigest = adsDigest({
          placement,
          gate: reason,
          policy,
          candidates: candidateDigest(request.candidates),
        });
        const decisionId = mintPlacementDecisionId({
          slotId: slot.slotId,
          campaignId: campaign.campaignId,
          surface: request.surface,
          evaluatedAt: now,
          inputsDigest,
        });
        const record: PlacementDecisionRecord = {
          decisionId,
          evaluatedAt: now,
          surface: request.surface,
          slotId: slot.slotId,
          campaignId: campaign.campaignId,
          publisherTenantId: request.publisherTenantId,
          payerId: campaign.payerId,
          authoritySnapshot: {
            placementId: placement.placementId,
            campaignId: campaign.campaignId,
            payerId: campaign.payerId,
            surface: request.surface,
            grant: "ad.buy",
            decision: "denied",
            decisionRef: decisionId,
            budgetScopeRef: budgetScopeRef(campaign.campaignId, now),
            budget: "unresolved",
            checkedAt: now,
            validUntil: campaign.endsAt,
          },
          exposureWindow: null,
          inputsDigest,
          evaluation: { eligible: false, reason },
          composition: { included: false },
        };
        records.push(record);
        continue;
      }

      try {
        const totals = ledger.countedTotalsByCampaign(
          campaign.campaignId,
          utcDayKey(now),
        );
        const budget =
          totals.impressions >= campaign.budgetScope.impressionsCap ||
          totals.clicks >= campaign.budgetScope.clicksCap
            ? ("exhausted" as const)
            : ("within-scope" as const);
        const exposure = ledger.exposureWindow({
          objectId: placement.objectId,
          surface: request.surface,
          viewerScopeRef: request.viewerScopeRef,
          observedAt: now,
          windowMs: policy.frequencyWindowMs,
        });
        const campaignLive =
          campaign.status === "active" &&
          campaign.startsAt <= now &&
          now < campaign.endsAt;
        const inputsDigest = adsDigest({
          placement,
          budget,
          exposure,
          policy,
          candidates: candidateDigest(request.candidates),
        });
        const decisionId = mintPlacementDecisionId({
          slotId: slot.slotId,
          campaignId: campaign.campaignId,
          surface: request.surface,
          evaluatedAt: now,
          inputsDigest,
        });
        const authority: PlacementAuthoritySnapshot = {
          placementId: placement.placementId,
          campaignId: campaign.campaignId,
          payerId: campaign.payerId,
          surface: request.surface,
          grant: "ad.buy",
          decision: campaignLive ? "allowed" : "denied",
          decisionRef: decisionId,
          budgetScopeRef: budgetScopeRef(campaign.campaignId, now),
          budget,
          checkedAt: now,
          validUntil: campaign.endsAt,
        };
        const candidate = request.candidates.find(
          (c) => c.objectId === placement.objectId,
        );
        const evaluation = evaluateSponsoredPlacement(placement, candidate, {
          ...baseContext,
          authorities: [authority],
          exposures: [exposure],
        });
        const record: PlacementDecisionRecord = {
          decisionId,
          evaluatedAt: now,
          surface: request.surface,
          slotId: slot.slotId,
          campaignId: campaign.campaignId,
          publisherTenantId: request.publisherTenantId,
          payerId: campaign.payerId,
          authoritySnapshot: authority,
          exposureWindow: exposure,
          inputsDigest,
          evaluation: evaluation.eligible
            ? {
                eligible: true,
                projectionDigest: adsDigest(evaluation.placement),
              }
            : { eligible: false, reason: evaluation.reason },
        };
        records.push(record);
        pending.push({ record, placement });
        authorities.push(authority);
        exposures.push(exposure);
        sponsoredCandidates.push(placement);
      } catch (err) {
        records.push(
          failureRecord({
            surface: request.surface,
            publisherTenantId: request.publisherTenantId,
            slotId: slot.slotId,
            campaignId: campaign.campaignId,
            payerId: campaign.payerId,
            evaluatedAt: now,
            err,
          }),
        );
      }
    }
  }

  const placements = composeObjectPlacements(
    request.candidates,
    sponsoredCandidates,
    { ...baseContext, authorities, exposures },
    request.limit,
  );

  const includedPlacementIds = new Set(
    placements
      .map((p) => p.sponsorship?.placementId)
      .filter((id): id is string => typeof id === "string"),
  );
  const capacity = compositionCapacity(request.candidates, request.limit);
  const maxSponsoredAllowed = Math.min(
    policy.maxSponsoredPlacements,
    Math.floor(capacity * policy.maxSponsoredShare),
  );

  let sponsored: AdsCompositionResult["sponsored"] = null;
  for (const entry of pending) {
    const included = includedPlacementIds.has(entry.placement.placementId);
    if (entry.record.evaluation.eligible) {
      entry.record.composition = included
        ? { included: true }
        : {
            included: false,
            reason:
              maxSponsoredAllowed === 0
                ? "share-cap"
                : "composition-excluded",
          };
    } else {
      entry.record.composition = { included: false };
    }
    if (included && sponsored === null) {
      const composed = placements.find(
        (p) => p.sponsorship?.placementId === entry.placement.placementId,
      );
      if (composed?.sponsorship) {
        sponsored = {
          placement: composed.sponsorship,
          decisionId: entry.record.decisionId,
        };
      }
    }
  }

  // Every decision is durable BEFORE the render result is returned:
  // the ledger's ingest-time coverage check depends on it.
  const placementIdByDecision = new Map<string, string | null>();
  for (const entry of pending) {
    placementIdByDecision.set(entry.record.decisionId, entry.placement.placementId);
  }
  for (const record of records) writeQuietly(record);

  return {
    placements,
    sponsored,
    evaluations: records.map((record) =>
      summaryOf(
        record,
        placementIdByDecision.get(record.decisionId) ??
          (record.authoritySnapshot?.placementId || null),
      ),
    ),
  };
}

function candidateDigest(
  candidates: readonly RankedCandidate[],
): { objectId: string; score: number; semanticProximity: number; semanticTargetPresent: boolean; suppression: string | null }[] {
  return candidates.map((c) => ({
    objectId: c.objectId,
    score: c.score,
    semanticProximity: c.semanticProximity,
    semanticTargetPresent: c.semanticTargetPresent === true,
    suppression: c.suppression ?? null,
  }));
}
