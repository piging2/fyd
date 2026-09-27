/**
 * Lane 6 tests: section spacing scale.
 *
 * 1. Hard archaeology numbers: major section rhythm 64px -> 128px
 *    (96/128 desktop intent, mobile-compressed), minor 48px -> 80px,
 *    container 1280px, card radius 12px, warm card shadow.
 * 2. Emitted clamp() values are zoom-safe (rem floor on the preferred
 *    term) and deterministic.
 * 3. Existing layout.contentMaxWidth token is reused additively.
 *
 * Run: npx jest --config src/fyd/theme/jest.config.cjs
 */

import { DEFAULT_FYD_THEME } from "../../sitespec/types";
import {
  CARD_RADIUS_REM,
  CARD_SHADOW,
  CARD_SHADOW_HOVER,
  CONTAINER_MAX_REM,
  buildSectionSpacing,
  emitSpacingCssVariables,
} from "../spacing";

function evalClampAt(clampStr: string, vwPx: number): number {
  const m = clampStr.match(
    /^clamp\(([\d.]+)rem,\s*([\d.]+)rem \+ ([\d.]+)vw,\s*([\d.]+)rem\)$/,
  );
  if (!m) throw new Error("not a fluid clamp: " + clampStr);
  const nums = m.map(Number);
  const midPx = (nums[2] + (nums[3] * vwPx) / 100) * 16;
  return Math.min(Math.max(midPx, nums[1] * 16), nums[4] * 16);
}

describe("section rhythm", () => {
  test("major: 64px at 320px, 128px at 1440px", () => {
    const s = buildSectionSpacing(DEFAULT_FYD_THEME);
    expect(evalClampAt(s.sectionMajor, 320)).toBeCloseTo(64, 0);
    expect(evalClampAt(s.sectionMajor, 1440)).toBeCloseTo(128, 0);
  });

  test("minor: 48px at 320px, 80px at 1440px", () => {
    const s = buildSectionSpacing(DEFAULT_FYD_THEME);
    expect(evalClampAt(s.sectionMinor, 320)).toBeCloseTo(48, 0);
    expect(evalClampAt(s.sectionMinor, 1440)).toBeCloseTo(80, 0);
  });

  test("card gap: 20px at 320px, 24px at 1440px", () => {
    const s = buildSectionSpacing(DEFAULT_FYD_THEME);
    expect(evalClampAt(s.cardGap, 320)).toBeCloseTo(20, 0);
    expect(evalClampAt(s.cardGap, 1440)).toBeCloseTo(24, 0);
  });

  test("stack gaps match the archaeology mt-4/mt-5 rhythm", () => {
    const s = buildSectionSpacing(DEFAULT_FYD_THEME);
    expect(s.stackEyebrow).toBe("1rem");
    expect(s.stackDescription).toBe("1.25rem");
  });
});

describe("container and card geometry", () => {
  test("container default is 1280px", () => {
    expect(CONTAINER_MAX_REM).toBe(80);
    const s = buildSectionSpacing(DEFAULT_FYD_THEME);
    expect(s.containerMax).toBe("80rem");
  });

  test("existing layout.contentMaxWidth token is reused additively", () => {
    const theme = {
      ...DEFAULT_FYD_THEME,
      layout: { contentMaxWidth: 1024 },
    };
    const s = buildSectionSpacing(theme);
    expect(s.containerMax).toBe("64rem");
  });

  test("card radius is 12px with a warm layered shadow", () => {
    expect(CARD_RADIUS_REM).toBe(0.75);
    expect(CARD_SHADOW).toContain("rgba(53, 36, 35, 0.18)");
    expect(CARD_SHADOW_HOVER).toContain("rgba(53, 36, 35, 0.3)");
    const s = buildSectionSpacing(DEFAULT_FYD_THEME);
    expect(s.cardRadius).toBe("0.75rem");
  });
});

describe("emitSpacingCssVariables", () => {
  test("pure: byte-identical repeats, no em dashes", () => {
    const a = emitSpacingCssVariables(DEFAULT_FYD_THEME);
    expect(a).toBe(emitSpacingCssVariables(DEFAULT_FYD_THEME));
    expect(a).not.toContain("—");
  });

  test("emits the full spacing variable set", () => {
    const css = emitSpacingCssVariables(DEFAULT_FYD_THEME);
    for (const name of [
      "--fyd-space-section-major",
      "--fyd-space-section-minor",
      "--fyd-space-card-gap",
      "--fyd-space-stack-eyebrow",
      "--fyd-space-stack-description",
      "--fyd-container-max",
      "--fyd-radius-card",
      "--fyd-shadow-card",
      "--fyd-shadow-card-hover",
    ]) {
      expect(css).toContain(name + ":");
    }
    expect(css).toContain("--fyd-container-max: 80rem;");
    expect(css).toContain("--fyd-radius-card: 0.75rem;");
  });

  test("snapshot of the emitted block", () => {
    expect(emitSpacingCssVariables(DEFAULT_FYD_THEME)).toMatchSnapshot();
  });
});
