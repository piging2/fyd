/**
 * Tests for the lane's design tokens (media-tokens.ts).
 *
 * Pins: deterministic palette derivation, the warm artisan hue band,
 * the brand-aware foreground picker (two brand tokens only, chosen by
 * lightness), and the hard rule that a literal RGB complement
 * (hue + 180) is never computed.
 */

import {
  FOREGROUND_ON_DARK,
  FOREGROUND_ON_LIGHT,
  HUE_MIN,
  HUE_SPAN,
  foregroundForLightness,
  gradientCss,
  paletteFor,
  tokenDigest,
  tokensForObject,
} from "../media-tokens";

describe("tokenDigest", () => {
  test("is sha256 hex (known-answer vector)", () => {
    expect(tokenDigest("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  test("deterministic", () => {
    expect(tokenDigest("biz-1")).toBe(tokenDigest("biz-1"));
  });
});

describe("paletteFor", () => {
  test("deterministic: same seed, byte-identical palette", () => {
    expect(paletteFor("biz-1")).toEqual(paletteFor("biz-1"));
  });

  test("hue stays inside the warm artisan band", () => {
    for (const seed of ["a", "b", "coppersmith", "happy-place", "x".repeat(64)]) {
      const p = paletteFor(seed);
      expect(p.hue).toBeGreaterThanOrEqual(HUE_MIN);
      expect(p.hue).toBeLessThanOrEqual(HUE_MIN + HUE_SPAN - 1);
    }
  });

  test("companion hue is analogous, never a literal RGB complement", () => {
    for (const seed of ["a", "b", "c", "d", "e", "biz-1", "biz-2"]) {
      const p = paletteFor(seed);
      expect(p.hue2).not.toBe((p.hue + 180) % 360);
      // Analogous: the companion sits near the primary, not opposite it.
      expect(Math.abs(p.hue2 - p.hue)).toBeLessThan(90);
    }
  });
});

describe("foregroundForLightness", () => {
  test("chooses only between the two brand foreground tokens", () => {
    for (const l of [0, 20, 38, 54, 55, 62, 80, 100]) {
      expect([FOREGROUND_ON_DARK, FOREGROUND_ON_LIGHT]).toContain(
        foregroundForLightness(l),
      );
    }
  });

  test("dark backgrounds get the light token, light backgrounds the dark token", () => {
    expect(foregroundForLightness(30)).toBe(FOREGROUND_ON_DARK);
    expect(foregroundForLightness(70)).toBe(FOREGROUND_ON_LIGHT);
  });
});

describe("gradientCss", () => {
  test("deterministic and carries the palette hue, never its complement", () => {
    const p = paletteFor("biz-1");
    const css = gradientCss(p);
    expect(css).toBe(gradientCss(paletteFor("biz-1")));
    expect(css).toContain("hsl(" + p.hue + " ");
    expect(css).not.toContain("hsl(" + ((p.hue + 180) % 360) + " ");
  });
});

describe("tokensForObject", () => {
  test("deterministic token set for an object", () => {
    expect(tokensForObject("biz-1", "Coppersmith")).toEqual(
      tokensForObject("biz-1", "Coppersmith"),
    );
  });

  test("initial is the uppercased first title letter", () => {
    expect(tokensForObject("biz-1", "coppersmith plumbing").initial).toBe("C");
  });

  test("foreground is a brand token", () => {
    const t = tokensForObject("biz-1", "Coppersmith");
    expect([FOREGROUND_ON_DARK, FOREGROUND_ON_LIGHT]).toContain(t.foreground);
  });
});
