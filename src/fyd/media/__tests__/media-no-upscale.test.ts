/**
 * Item 9 (fyd-execution) regression: the derivatives pipeline never
 * upscales. planDerivatives(sourceWidth) must never yield a planned width
 * above sourceWidth (withoutEnlargement at mint time). This is the
 * mint-time half of INV-RM-1; the render seam's half is pinned by
 * responsive-media.test.ts.
 */

import { planDerivatives } from "../derivatives";

test.each([768, 400, 118, 1])(
  "planDerivatives(%i) yields no width above the source",
  (sourceWidth) => {
    const plans = planDerivatives(sourceWidth);
    expect(plans.length).toBeGreaterThan(0);
    for (const p of plans) {
      expect(p.width).toBeLessThanOrEqual(sourceWidth);
    }
  },
);

test("a narrow source still yields exactly one content rendition at source width", () => {
  const plans = planDerivatives(118).filter((p) => p.name !== "blur");
  expect(plans).toHaveLength(1);
  expect(plans[0].width).toBe(118);
});
