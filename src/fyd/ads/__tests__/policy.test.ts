import {
  ADS_POLICY_VERSION,
  BUDGET_WINDOW_MS,
  DAILY_CLICKS_CAP,
  DAILY_IMPRESSIONS_CAP,
  FREQUENCY_WINDOW_MS,
  MAX_OBJECT_IMPRESSIONS_PER_WINDOW,
  MAX_SPONSORED_PLACEMENTS,
  MAX_SPONSORED_SHARE,
  MINIMUM_RELEVANCE,
  MIN_ORGANIC_BETWEEN_SPONSORED,
  SNAPSHOT_MAX_AGE_MS,
  budgetScopeRef,
  sponsoredPlacementPolicy,
  utcDayKey,
} from "../policy";
import { DISCLOSURE_TEXT, DISCLOSURE_TEXT_VERSION } from "../disclosure";

describe("BudgetPolicy v1 constants (DESIGN.md)", () => {
  it("carries the design's exact values", () => {
    expect(ADS_POLICY_VERSION).toBe("loop-v1");
    expect(MAX_SPONSORED_PLACEMENTS).toBe(1);
    expect(MAX_SPONSORED_SHARE).toBe(0.25);
    expect(MIN_ORGANIC_BETWEEN_SPONSORED).toBe(2);
    expect(MAX_OBJECT_IMPRESSIONS_PER_WINDOW).toBe(3);
    expect(FREQUENCY_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
    expect(DAILY_IMPRESSIONS_CAP).toBe(500);
    expect(DAILY_CLICKS_CAP).toBe(100);
    expect(BUDGET_WINDOW_MS).toBe(FREQUENCY_WINDOW_MS);
    expect(SNAPSHOT_MAX_AGE_MS).toBeGreaterThan(0);
    expect(MINIMUM_RELEVANCE).toBeGreaterThanOrEqual(0);
    expect(MINIMUM_RELEVANCE).toBeLessThanOrEqual(1);
  });

  it("builds the rank contract's policy shape from the constants", () => {
    expect(sponsoredPlacementPolicy()).toEqual({
      minimumRelevance: MINIMUM_RELEVANCE,
      maxSponsoredPlacements: MAX_SPONSORED_PLACEMENTS,
      maxSponsoredShare: MAX_SPONSORED_SHARE,
      minOrganicBetweenSponsored: MIN_ORGANIC_BETWEEN_SPONSORED,
      maxObjectImpressionsPerWindow: MAX_OBJECT_IMPRESSIONS_PER_WINDOW,
      frequencyWindowMs: FREQUENCY_WINDOW_MS,
      snapshotMaxAgeMs: SNAPSHOT_MAX_AGE_MS,
    });
  });

  it("formats budget scope refs as loop-v1:<campaignId>:<yyyymmdd> in UTC", () => {
    const when = Date.UTC(2026, 10, 4, 23, 59, 59); // 2026-11-04 UTC
    expect(utcDayKey(when)).toBe("20261104");
    expect(budgetScopeRef("ping-house-001", when)).toBe("loop-v1:ping-house-001:20261104");
    expect(budgetScopeRef("ping-house-001", new Date(when))).toBe(
      "loop-v1:ping-house-001:20261104",
    );
  });
});

describe("pinned disclosure copy", () => {
  it("states placements, the Sponsored label, recording, and revocation", () => {
    expect(DISCLOSURE_TEXT_VERSION).toBe("loop-disclosure-v1");
    expect(DISCLOSURE_TEXT).toContain("Sponsored");
    expect(DISCLOSURE_TEXT).toContain("labeled");
    expect(DISCLOSURE_TEXT).toContain("recorded");
    expect(DISCLOSURE_TEXT).toContain("revoke");
    expect(DISCLOSURE_TEXT).toContain("immediately");
  });
});
