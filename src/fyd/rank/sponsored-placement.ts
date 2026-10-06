import type { RankedCandidate } from "./object-ranker";

/**
 * FYD's placement projection, not a campaign store, spend API, or authority.
 * No production campaign provider is bound. Inputs must eventually come from
 * the existing campaign/budget/policy authorities, never browser assertions.
 * Business identity, facts, evidence and relationships are deliberately absent.
 */
export interface SponsoredPlacement {
  placementId: string;
  objectId: string;
  campaignId: string;
  payerId: string;
  sponsorDisplayName: string;
  disclosure: "Sponsored";
  reason: string;
  /** Source for the non-sensitive contextual explanation. */
  targeting: {
    kind: "category" | "location" | "query" | "relationship" | "surface";
    sourceRef: string;
  };
  surface: string;
  campaignStatus: "active" | "paused" | "ended";
  startsAt: number;
  endsAt: number;
}

/** A read projection of an existing authority decision; this grants nothing. */
export interface PlacementAuthoritySnapshot {
  placementId: string;
  campaignId: string;
  payerId: string;
  surface: string;
  grant: "ad.buy";
  decision: "allowed" | "denied" | "unresolved";
  decisionRef: string;
  budgetScopeRef: string;
  budget: "within-scope" | "exhausted" | "unresolved";
  checkedAt: number;
  validUntil: number;
}

export interface ObjectExposureWindow {
  objectId: string;
  surface: string;
  /** Opaque authorized viewer/session scope, never a public browsing identity. */
  viewerScopeRef: string;
  windowStartedAt: number;
  observedAt: number;
  impressions: number;
}

export interface SponsoredPlacementPolicy {
  minimumRelevance: number;
  maxSponsoredPlacements: number;
  /** 0..1 share cap, applied to actual composition capacity. */
  maxSponsoredShare: number;
  minOrganicBetweenSponsored: number;
  maxObjectImpressionsPerWindow: number;
  frequencyWindowMs: number;
  /** Freshness bound for authority and exposure snapshots. */
  snapshotMaxAgeMs: number;
}

export interface PlacementContext {
  surface: string;
  now: number;
  viewerScopeRef: string;
  policy: SponsoredPlacementPolicy;
  authorities: readonly PlacementAuthoritySnapshot[];
  exposures: readonly ObjectExposureWindow[];
}

declare const eligiblePlacementBrand: unique symbol;
/**
 * Renderer-safe projection produced only after eligibility checks. The brand
 * is a compile-time boundary, NOT an authorization token or signature.
 */
export type EligibleSponsoredPlacement = Readonly<{
  objectId: string;
  placementId: string;
  campaignId: string;
  payerId: string;
  disclosure: "Sponsored";
  sponsorDisplayName: string;
  reason: string;
  surface: string;
  evaluatedAt: number;
  validUntil: number;
  readonly [eligiblePlacementBrand]: true;
}>;

export type PlacementRejection =
  | "invalid-context" | "missing-disclosure" | "missing-payer"
  | "invalid-placement" | "inactive-campaign" | "outside-surface"
  | "suppressed-object" | "below-relevance-floor" | "authority-unresolved"
  | "outside-budget" | "frequency-unresolved" | "frequency-capped";

export type PlacementEvaluation =
  | { eligible: true; placement: EligibleSponsoredPlacement }
  | { eligible: false; reason: PlacementRejection };

const hasText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const finite = (value: number) => Number.isFinite(value);
const nonnegativeInteger = (value: number) => Number.isInteger(value) && value >= 0;

function validContext(context: PlacementContext): boolean {
  const p = context.policy;
  return hasText(context.surface) && hasText(context.viewerScopeRef) && finite(context.now)
    && finite(p.minimumRelevance) && p.minimumRelevance >= 0 && p.minimumRelevance <= 1
    && nonnegativeInteger(p.maxSponsoredPlacements)
    && finite(p.maxSponsoredShare) && p.maxSponsoredShare >= 0 && p.maxSponsoredShare <= 1
    && nonnegativeInteger(p.minOrganicBetweenSponsored)
    && nonnegativeInteger(p.maxObjectImpressionsPerWindow)
    && finite(p.frequencyWindowMs) && p.frequencyWindowMs > 0
    && finite(p.snapshotMaxAgeMs) && p.snapshotMaxAgeMs > 0;
}

function fresh(checkedAt: number, now: number, maximumAge: number): boolean {
  return finite(checkedAt) && checkedAt <= now && now - checkedAt < maximumAge;
}

export function evaluateSponsoredPlacement(
  placement: SponsoredPlacement,
  candidate: RankedCandidate | undefined,
  context: PlacementContext,
): PlacementEvaluation {
  const reject = (reason: PlacementRejection): PlacementEvaluation => ({ eligible: false, reason });
  if (!validContext(context)) return reject("invalid-context");
  if (placement.disclosure !== "Sponsored") return reject("missing-disclosure");
  if (!hasText(placement.payerId) || !hasText(placement.sponsorDisplayName)) return reject("missing-payer");
  if (![placement.placementId, placement.objectId, placement.campaignId, placement.reason, placement.targeting?.sourceRef].every(hasText)
    || !["category", "location", "query", "relationship", "surface"].includes(placement.targeting?.kind)) return reject("invalid-placement");
  if (placement.campaignStatus !== "active" || !finite(placement.startsAt) || !finite(placement.endsAt)
    || placement.startsAt > context.now || placement.endsAt <= context.now) return reject("inactive-campaign");
  if (placement.surface !== context.surface) return reject("outside-surface");
  if (!candidate || candidate.objectId !== placement.objectId || candidate.suppression !== undefined) return reject("suppressed-object");
  if (candidate.semanticTargetPresent !== true || !finite(candidate.score) || !finite(candidate.semanticProximity)
    || candidate.semanticProximity < context.policy.minimumRelevance || candidate.semanticProximity > 1) return reject("below-relevance-floor");

  const authority = context.authorities.find((a) => a.placementId === placement.placementId
    && a.campaignId === placement.campaignId && a.payerId === placement.payerId && a.surface === context.surface);
  if (!authority || authority.grant !== "ad.buy" || authority.decision !== "allowed" || !hasText(authority.decisionRef)
    || !fresh(authority.checkedAt, context.now, context.policy.snapshotMaxAgeMs)
    || !finite(authority.validUntil) || authority.validUntil <= context.now) return reject("authority-unresolved");
  if (authority.budget !== "within-scope" || !hasText(authority.budgetScopeRef)) return reject("outside-budget");

  const exposure = context.exposures.find((e) => e.objectId === placement.objectId
    && e.surface === context.surface && e.viewerScopeRef === context.viewerScopeRef);
  if (!exposure || !nonnegativeInteger(exposure.impressions)
    || !fresh(exposure.observedAt, context.now, context.policy.snapshotMaxAgeMs)
    || !finite(exposure.windowStartedAt) || exposure.windowStartedAt > context.now - context.policy.frequencyWindowMs) return reject("frequency-unresolved");
  if (exposure.impressions >= context.policy.maxObjectImpressionsPerWindow) return reject("frequency-capped");

  // Copy only placement presentation fields. Extra business/evidence payloads
  // cannot pass through this projection or modify the input object.
  const projected = {
    objectId: placement.objectId,
    placementId: placement.placementId,
    campaignId: placement.campaignId,
    payerId: placement.payerId,
    disclosure: placement.disclosure,
    sponsorDisplayName: placement.sponsorDisplayName,
    reason: placement.reason,
    surface: placement.surface,
    evaluatedAt: context.now,
    validUntil: Math.min(placement.endsAt, authority.validUntil,
      authority.checkedAt + context.policy.snapshotMaxAgeMs,
      exposure.observedAt + context.policy.snapshotMaxAgeMs),
  } as EligibleSponsoredPlacement;
  return { eligible: true, placement: Object.freeze(projected) };
}

/** Deep links without the original eligible placement context remain organic. */
export function getSponsoredPresentation(
  placement: EligibleSponsoredPlacement | null | undefined,
  context: { objectId: string; surface: string; now: number },
): EligibleSponsoredPlacement | null {
  if (!placement || placement.objectId !== context.objectId || placement.surface !== context.surface
    || placement.disclosure !== "Sponsored" || !hasText(placement.payerId)
    || !hasText(placement.sponsorDisplayName) || !hasText(placement.reason)
    || !finite(context.now) || !finite(placement.evaluatedAt) || !finite(placement.validUntil)
    || context.now < placement.evaluatedAt || context.now >= placement.validUntil) return null;
  return placement;
}

export interface ObjectPlacement {
  candidate: RankedCandidate;
  sponsorship: EligibleSponsoredPlacement | null;
}

/**
 * Deterministic composition with density/gap caps and no money score. Eligible
 * ads retain their organic score; the candidate list remains unmodified. No
 * events, budget mutation, impressions, or spending happen in this function.
 */
export function composeObjectPlacements(
  organic: readonly RankedCandidate[],
  sponsored: readonly SponsoredPlacement[],
  context: PlacementContext,
  limit: number,
): ObjectPlacement[] {
  if (!nonnegativeInteger(limit)) return [];
  const seen = new Set<string>();
  const remaining = organic.filter((candidate) => {
    if (candidate.suppression !== undefined || seen.has(candidate.objectId)) return false;
    seen.add(candidate.objectId);
    return true;
  });
  if (!validContext(context)) return remaining.slice(0, limit).map((candidate) => ({ candidate, sponsorship: null }));
  const capacity = Math.min(limit, remaining.length);
  const maxSponsored = Math.min(context.policy.maxSponsoredPlacements, Math.floor(capacity * context.policy.maxSponsoredShare));
  const eligible = sponsored.flatMap((placement) => {
    const candidate = remaining.find((item) => item.objectId === placement.objectId);
    const result = evaluateSponsoredPlacement(placement, candidate, context);
    return result.eligible && candidate ? [{ candidate, sponsorship: result.placement }] : [];
  }).sort((a, b) => b.candidate.score - a.candidate.score || (a.sponsorship.placementId < b.sponsorship.placementId ? -1 : a.sponsorship.placementId > b.sponsorship.placementId ? 1 : 0));
  const output: ObjectPlacement[] = [];
  let sponsoredCount = 0;
  let organicSinceSponsor = 0;
  while (remaining.length > 0 && output.length < capacity) {
    const nextSponsored = sponsoredCount < maxSponsored && organicSinceSponsor >= context.policy.minOrganicBetweenSponsored
      ? eligible.find((item) => remaining.some((candidate) => candidate.objectId === item.candidate.objectId))
      : undefined;
    if (nextSponsored) {
      output.push(nextSponsored);
      remaining.splice(remaining.findIndex((item) => item.objectId === nextSponsored.candidate.objectId), 1);
      sponsoredCount++;
      organicSinceSponsor = 0;
    } else {
      output.push({ candidate: remaining.shift()!, sponsorship: null });
      organicSinceSponsor++;
    }
  }
  return output;
}
