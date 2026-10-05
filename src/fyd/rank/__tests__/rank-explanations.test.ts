import { explainCandidateRank, rankCandidates, relationshipSaturationPenalty, type RankCandidate } from "../object-ranker";

const now = 1_700_000_000_000;
const candidate: RankCandidate = {
  objectId: "example", semanticProximity: 0.5, semanticTargetPresent: true,
  followed: false, liked: false, capabilityCount: 3, recentInteractionAt: null,
  slotStability: 1, slotCollisionRisk: 0,
};

/** Fixture values expose product semantics rather than only copying the formula. */
export const RANK_SEMANTIC_FIXTURES = [
  { name: "unfollowed/unliked", input: {}, score: 0.375, relationship: 0, saturation: 0, recency: 0 },
  { name: "followed", input: { followed: true }, score: 0.625, relationship: 0.25, saturation: 0, recency: 0 },
  { name: "liked", input: { liked: true }, score: 0.375, relationship: 0, saturation: 0, recency: 0 },
  { name: "followed+liked", input: { followed: true, liked: true }, score: 0.325, relationship: 0.25, saturation: -0.3, recency: 0 },
  { name: "recently interacted", input: { recentInteractionAt: now }, score: 0.525, relationship: 0, saturation: 0, recency: 0.15 },
];

describe("organic rank explanations", () => {
  test.each(RANK_SEMANTIC_FIXTURES)("$name exposes the unchanged score and its reason", (fixture) => {
    const result = explainCandidateRank({ ...candidate, ...fixture.input }, now);
    expect(result.score).toBeCloseTo(fixture.score);
    expect(result.breakdown.baseRelevance).toBeCloseTo(0.375);
    expect(result.breakdown.relationshipAdjustment).toBe(fixture.relationship);
    expect(result.breakdown.saturationAdjustment).toBeCloseTo(fixture.saturation);
    expect(result.breakdown.recencyAdjustment).toBe(fixture.recency);
    expect(result.breakdown.sponsorshipAdjustment).toBe(0);
    expect(result.breakdown.finalScore).toBe(result.score);
    expect(result.reasons.some((reason) => reason.code === "followed")).toBe(!!fixture.input.followed);
    expect(result.reasons.some((reason) => reason.code === "relationship-saturation")).toBe(fixture.saturation < 0);
  });

  test("saturation is an explicit existing policy, not a negative like score", () => {
    expect(relationshipSaturationPenalty({ followed: false, liked: true })).toBe(0);
    expect(relationshipSaturationPenalty({ followed: true, liked: true })).toBe(0.3);
  });

  test.each(["hidden", "dismissed", "not-interested"] as const)("%s is suppression, not a lower paid score", (suppression) => {
    expect(rankCandidates([{ ...candidate, suppression }], now)).toEqual([]);
  });

  test("a default proximity score cannot fabricate page/category/location reasons", () => {
    const result = explainCandidateRank({ ...candidate, semanticTargetPresent: undefined, followed: false, capabilityCount: 0 }, now);
    expect(result.reasons).toEqual([]);
    expect(result.score).toBeGreaterThan(0);
  });

  test("a stale/future interaction does not get a recent-interaction explanation", () => {
    for (const at of [now + 1, now - 8 * 86_400_000]) {
      expect(explainCandidateRank({ ...candidate, recentInteractionAt: at }, now).reasons.some((r) => r.code === "recent-interaction")).toBe(false);
    }
  });
});
