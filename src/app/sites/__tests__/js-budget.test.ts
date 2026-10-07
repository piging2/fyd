/**
 * Item 8 (fyd-execution) regression: INV-SC-3 measured JS reduction.
 *
 * Success is a number, not a file move: the total JS bytes transferred for
 * each generated site (measured by the item-11 lab harness with the pinned
 * transport method) must stay at or under the pinned ceiling. The ceiling
 * was set from the FIRST post-fix measurement, not from opinion; any
 * future increase fails this test until the harness re-measures and the
 * ceiling is deliberately re-pinned with evidence.
 *
 * Both sites, every run (INV-RG-1).
 */

import { PINNED_LAB } from "@/fyd/perf/lab-harness/pinned";

const SITES = ["coppersmith-plumbing", "happy-place"];

test("pinned lab record is honestly labeled (lab, never field)", () => {
  expect(PINNED_LAB.label).toMatch(/lab/i);
  expect(PINNED_LAB.label).not.toMatch(/field|p75/i);
  for (const site of SITES) {
    expect(typeof PINNED_LAB.jsBudgetBytes[site]).toBe("number");
    expect(PINNED_LAB.jsBudgetBytes[site]).toBeGreaterThan(0);
    expect(typeof PINNED_LAB.jsBudgetCeilingBytes[site]).toBe("number");
  }
});

test.each(SITES)("measured JS bytes for %s stay within the pinned ceiling", (site) => {
  expect(PINNED_LAB.jsBudgetBytes[site]).toBeLessThanOrEqual(
    PINNED_LAB.jsBudgetCeilingBytes[site],
  );
});
