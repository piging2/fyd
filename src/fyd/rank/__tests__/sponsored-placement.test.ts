import { explainCandidateRank } from "../object-ranker";
import {
  composeObjectPlacements, evaluateSponsoredPlacement, getSponsoredPresentation,
  type PlacementContext, type SponsoredPlacement,
} from "../sponsored-placement";

const now = 1_700_000_000_000;
const candidate = (objectId = "business", semanticProximity = 0.6) => explainCandidateRank({
  objectId, semanticProximity, semanticTargetPresent: true, followed: false, liked: false, capabilityCount: 3,
  recentInteractionAt: null, slotStability: 1, slotCollisionRisk: 0,
}, now);
const placement: SponsoredPlacement = {
  placementId: "test-placement", objectId: "business", campaignId: "test-campaign", payerId: "test-payer",
  sponsorDisplayName: "Example sponsor", disclosure: "Sponsored", reason: "Sponsored on this discovery surface",
  targeting: { kind: "surface", sourceRef: "fixture:surface" }, surface: "fyd-discovery",
  campaignStatus: "active", startsAt: now - 1000, endsAt: now + 100_000,
};
function context(): PlacementContext {
  return {
    surface: "fyd-discovery", now, viewerScopeRef: "private-test-session",
    policy: { minimumRelevance: 0.4, maxSponsoredPlacements: 1, maxSponsoredShare: 0.25,
      minOrganicBetweenSponsored: 2, maxObjectImpressionsPerWindow: 2, frequencyWindowMs: 60_000, snapshotMaxAgeMs: 5000 },
    authorities: [{ placementId: placement.placementId, campaignId: placement.campaignId, payerId: placement.payerId,
      surface: placement.surface, grant: "ad.buy", decision: "allowed", decisionRef: "fixture:existing-authority", budgetScopeRef: "fixture:budget",
      budget: "within-scope", checkedAt: now, validUntil: now + 10_000 }],
    exposures: [{ objectId: placement.objectId, surface: placement.surface, viewerScopeRef: "private-test-session",
      windowStartedAt: now - 60_000, observedAt: now, impressions: 0 }],
  };
}

describe("sponsored placement projection", () => {
  test("projects only placement truth, never business evidence or relationship truth", () => {
    const extra = Object.freeze({ ...placement, evidence: { verified: true }, followed: true, rating: 5 });
    const organic = Object.freeze(candidate());
    const result = evaluateSponsoredPlacement(extra, organic, context());
    expect(result.eligible).toBe(true);
    if (!result.eligible) throw new Error("expected eligible fixture");
    expect(result.placement.disclosure).toBe("Sponsored");
    expect(result.placement).not.toHaveProperty("evidence");
    expect(result.placement).not.toHaveProperty("followed");
    expect(result.placement).not.toHaveProperty("rating");
    expect(organic.followed).toBe(false);
    expect(organic.breakdown.sponsorshipAdjustment).toBe(0);
    expect(Object.isFrozen(result.placement)).toBe(true);
    expect(getSponsoredPresentation(result.placement, { objectId: "business", surface: placement.surface, now })).toBe(result.placement);
    expect(getSponsoredPresentation(result.placement, { objectId: "other", surface: placement.surface, now })).toBeNull();
    expect(getSponsoredPresentation(result.placement, { objectId: "business", surface: "deep-link", now })).toBeNull();
    expect(getSponsoredPresentation(result.placement, { objectId: "business", surface: placement.surface, now: now + 5000 })).toBeNull();
  });

  test.each([
    ["missing disclosure", { disclosure: "" }, "missing-disclosure"],
    ["missing payer", { payerId: "" }, "missing-payer"],
    ["missing sponsor label", { sponsorDisplayName: " " }, "missing-payer"],
    ["missing campaign", { campaignId: "" }, "invalid-placement"],
    ["missing explanation", { reason: "" }, "invalid-placement"],
    ["inactive campaign", { campaignStatus: "paused" }, "inactive-campaign"],
    ["future campaign", { startsAt: now + 1 }, "inactive-campaign"],
    ["ended campaign", { endsAt: now }, "inactive-campaign"],
    ["wrong surface", { surface: "other" }, "outside-surface"],
  ])("rejects %s", (_name, changes, reason) => {
    expect(evaluateSponsoredPlacement({ ...placement, ...changes } as SponsoredPlacement, candidate(), context())).toEqual({ eligible: false, reason });
  });

  test("no spend authority, budget, or frequency snapshot means no sponsored placement", () => {
    const c = context();
    expect(evaluateSponsoredPlacement(placement, candidate(), { ...c, authorities: [] })).toEqual({ eligible: false, reason: "authority-unresolved" });
    expect(evaluateSponsoredPlacement(placement, candidate(), { ...c, authorities: [{ ...c.authorities[0], budget: "exhausted" }] })).toEqual({ eligible: false, reason: "outside-budget" });
    expect(evaluateSponsoredPlacement(placement, candidate(), { ...c, authorities: [{ ...c.authorities[0], payerId: "other-payer" }] })).toEqual({ eligible: false, reason: "authority-unresolved" });
    expect(evaluateSponsoredPlacement(placement, candidate(), { ...c, authorities: [{ ...c.authorities[0], checkedAt: now - 5001 }] })).toEqual({ eligible: false, reason: "authority-unresolved" });
    expect(evaluateSponsoredPlacement(placement, candidate(), { ...c, exposures: [] })).toEqual({ eligible: false, reason: "frequency-unresolved" });
    expect(evaluateSponsoredPlacement(placement, candidate(), { ...c, viewerScopeRef: "another-session" })).toEqual({ eligible: false, reason: "frequency-unresolved" });
    expect(evaluateSponsoredPlacement(placement, candidate(), { ...c, exposures: [{ ...c.exposures[0], impressions: 2 }] })).toEqual({ eligible: false, reason: "frequency-capped" });
  });

  test("payment cannot rescue an irrelevant, suppressed, or absent object", () => {
    expect(evaluateSponsoredPlacement(placement, candidate("business", 0.2), context())).toEqual({ eligible: false, reason: "below-relevance-floor" });
    expect(evaluateSponsoredPlacement(placement, { ...candidate(), suppression: "dismissed" }, context())).toEqual({ eligible: false, reason: "suppressed-object" });
    expect(evaluateSponsoredPlacement(placement, undefined, context())).toEqual({ eligible: false, reason: "suppressed-object" });
  });

  test("composition respects actual density, organic gap, uniqueness and scores", () => {
    const organic = [candidate("a", 0.9), candidate("b", 0.8), candidate("c", 0.7), candidate()];
    const before = structuredClone(organic);
    const result = composeObjectPlacements(organic, [placement, placement], context(), 4);
    expect(result.map((p) => p.candidate.objectId)).toEqual(["a", "b", "business", "c"]);
    expect(result.map((p) => p.sponsorship?.disclosure ?? null)).toEqual([null, null, "Sponsored", null]);
    expect(result[2].candidate.score).toBe(organic[3].score);
    expect(organic).toEqual(before);
    expect(composeObjectPlacements(organic.slice(2), [placement], context(), 20).every((p) => p.sponsorship === null)).toBe(true);
    expect(composeObjectPlacements(organic, [placement], { ...context(), policy: { ...context().policy, maxSponsoredPlacements: 0 } }, 4).map((p) => p.candidate.objectId)).toEqual(["a", "b", "c", "business"]);
  });
});
