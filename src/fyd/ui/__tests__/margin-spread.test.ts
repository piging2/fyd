/**
 * Sparsity pin for the 18:47 correction (Nolan 2026-09-25): objects that
 * share one section anchor spread deterministically around the anchor
 * instead of collapsing into a single cluster.
 *
 * Run: npx jest --config src/fyd/ui/jest.config.cjs
 */

import { spreadSharedAnchors } from "../object-layer/MarginObjectLayer";

describe("spreadSharedAnchors", () => {
  test("objects sharing an anchor spread apart, centered on the anchor", () => {
    const out = spreadSharedAnchors([
      { objectId: "b", anchorKey: "s", anchorMidY: 1000, priority: 1 },
      { objectId: "a", anchorKey: "s", anchorMidY: 1000, priority: 0 },
      { objectId: "c", anchorKey: "s", anchorMidY: 1000, priority: 0 },
    ]);
    const ys = out.map((o) => o.spreadY);
    // all three spread, none collapses onto the anchor
    expect(new Set(ys).size).toBe(3);
    // centered: mean equals the anchor Y
    const mean = ys.reduce((t, y) => t + (y ?? 0), 0) / ys.length;
    expect(mean).toBe(1000);
    // deterministic order: priority first, then objectId
    expect(out.map((o) => o.objectId)).toEqual(["a", "c", "b"]);
    // neighbors at least 140px apart
    const sorted = [...ys].sort((x, y) => (x ?? 0) - (y ?? 0));
    expect((sorted[1] ?? 0) - (sorted[0] ?? 0)).toBeGreaterThanOrEqual(140);
    expect((sorted[2] ?? 0) - (sorted[1] ?? 0)).toBeGreaterThanOrEqual(140);
  });

  test("single object per anchor stays on the anchor", () => {
    const out = spreadSharedAnchors([
      { objectId: "a", anchorKey: "s1", anchorMidY: 500, priority: 0 },
      { objectId: "b", anchorKey: "s2", anchorMidY: 900, priority: 0 },
    ]);
    expect(out.map((o) => o.spreadY)).toEqual([500, 900]);
  });

  test("missing anchor measurement spreads as null (skipped by the layer)", () => {
    const out = spreadSharedAnchors([
      { objectId: "a", anchorKey: "s", anchorMidY: null, priority: 0 },
    ]);
    expect(out[0].spreadY).toBeNull();
  });
});
