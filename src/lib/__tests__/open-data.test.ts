import { diyMonthlyCost, evalGates, openCounters, TOOLING_PER_SITE_ESTIMATE } from "../open-data";

describe("open data provenance (the numbers freeze rule)", () => {
  it("every counter carries a source and an as-of date", () => {
    for (const c of openCounters) {
      expect(c.source.length).toBeGreaterThan(3);
      expect(c.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.value.length).toBeGreaterThan(0);
    }
  });

  it("every eval gate carries provenance, a test description, and a state", () => {
    for (const g of evalGates) {
      expect(g.source.length).toBeGreaterThan(3);
      expect(g.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(g.tests.length).toBeGreaterThan(20);
      expect(g.state.length).toBeGreaterThan(0);
    }
  });
});

describe("diyMonthlyCost", () => {
  it("prices time at 4.33 weeks per month plus per-site tooling", () => {
    expect(diyMonthlyCost(3, 75, 1)).toBe(Math.round(3 * 75 * 4.33) + TOOLING_PER_SITE_ESTIMATE);
    expect(diyMonthlyCost(0, 75, 2)).toBe(2 * TOOLING_PER_SITE_ESTIMATE);
    expect(diyMonthlyCost(10, 100, 3)).toBe(Math.round(10 * 100 * 4.33) + 3 * TOOLING_PER_SITE_ESTIMATE);
  });

  it("never goes negative and always counts at least one site of tooling", () => {
    expect(diyMonthlyCost(-5, -50, 0)).toBe(TOOLING_PER_SITE_ESTIMATE);
  });
});
