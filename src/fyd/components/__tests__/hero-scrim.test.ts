/**
 * LANE-RENDER-WIRE: hero-scrim unit tests.
 *
 * - relativeLuminance / contrastRatio follow the WCAG 2.x definitions
 *   (white on black = 21:1). contrastRatio takes luminances, not hex.
 * - minScrimOpacityForAa returns the smallest 3-decimal alpha whose
 *   worst-case composite reaches 4.5:1; deterministic and in [0, 1].
 * - heroScrimBackground is deterministic and carries the computed alpha.
 * - heroFocalPointOf works in 0..1 fractions (rendered as CSS percent),
 *   clamps to range, and fails closed on malformed input.
 */

import {
  contrastRatio,
  heroFocalPointOf,
  heroScrimBackground,
  minScrimOpacityForAa,
  relativeLuminance,
  textOverPhotoContrast,
} from "../hero-scrim";

describe("relativeLuminance", () => {
  it("maps white to 1 and black to 0", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
  });
});

describe("contrastRatio", () => {
  it("gives white on black 21:1", () => {
    expect(
      contrastRatio(
        relativeLuminance("#ffffff"),
        relativeLuminance("#000000"),
      ),
    ).toBeCloseTo(21, 5);
  });
});

describe("minScrimOpacityForAa", () => {
  it("returns a deterministic alpha in [0, 1]", () => {
    const alpha = minScrimOpacityForAa();
    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThanOrEqual(1);
    expect(minScrimOpacityForAa()).toBe(alpha);
  });

  it("is minimal: the returned alpha passes AA, one step less fails", () => {
    const alpha = minScrimOpacityForAa();
    expect(textOverPhotoContrast(alpha)).toBeGreaterThanOrEqual(4.5);
    if (alpha > 0) {
      expect(textOverPhotoContrast(alpha - 0.001)).toBeLessThan(4.5);
    }
  });
});

describe("heroScrimBackground", () => {
  it("carries the computed alpha and is deterministic", () => {
    const alpha = minScrimOpacityForAa();
    const bg = heroScrimBackground(alpha);
    expect(bg).toContain("linear-gradient");
    expect(bg).toContain(`rgba(0, 0, 0, ${alpha.toFixed(3)})`);
    expect(heroScrimBackground(alpha)).toBe(bg);
  });
});

describe("heroFocalPointOf", () => {
  it("returns a valid fractional focal point unchanged", () => {
    expect(
      heroFocalPointOf({ focalPoint: { x: 0.3, y: 0.7 } } as never),
    ).toEqual({ x: 0.3, y: 0.7 });
  });

  it("clamps fractions to the 0..1 range", () => {
    expect(
      heroFocalPointOf({ focalPoint: { x: -0.2, y: 1.4 } } as never),
    ).toEqual({ x: 0, y: 1 });
  });

  it("fails closed on malformed or missing focal points", () => {
    expect(heroFocalPointOf(null)).toBeNull();
    expect(heroFocalPointOf(undefined)).toBeNull();
    expect(heroFocalPointOf({} as never)).toBeNull();
    expect(
      heroFocalPointOf({ focalPoint: { x: NaN, y: 0.5 } } as never),
    ).toBeNull();
    expect(heroFocalPointOf({ focalPoint: { x: 0.5 } } as never)).toBeNull();
  });
});
