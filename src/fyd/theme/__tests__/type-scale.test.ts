/**
 * Lane 6 tests: fluid type system.
 *
 * 1. Utopia fluid() math: evaluates to the declared min at 320px and
 *    max at 1440px, monotonic between, rem floor on the preferred term.
 * 2. Body floor: body is a fixed 1rem and never shrinks.
 * 3. Voice selection: owner intent wins; graph signals decide; no
 *    customer-name signal can influence the outcome (invariant).
 * 4. Emit: pure function of (theme, voice); byte-identical repeats;
 *    voice changes the output; theme fonts override voice defaults.
 * 5. Hard archaeology numbers: display 36-72px, h2 28-48px (36px at
 *    the 768px breakpoint), lead 18-20px, tracking -0.02em on h2.
 * 6. No em dashes in emitted CSS.
 *
 * Run: npx jest --config src/fyd/theme/jest.config.cjs
 */

import { DEFAULT_FYD_THEME } from "../../sitespec/types";
import {
  BODY_FLOOR_REM,
  FLUID_MAX_VIEWPORT_PX,
  FLUID_MIN_VIEWPORT_PX,
  buildTypeSteps,
  emitTypeCssVariables,
  emitTypeRoleClasses,
  fluid,
  selectTypeVoice,
} from "../type-scale";
import type { TypeVoiceSignals } from "../type-scale";

/** Evaluate the middle linear term of a clamp() at a viewport width. */
function evalClampAt(clampStr: string, vwPx: number): number {
  const m = clampStr.match(
    /^clamp\(([\d.]+)rem,\s*([\d.]+)rem \+ ([\d.]+)vw,\s*([\d.]+)rem\)$/,
  );
  if (!m) throw new Error("not a fluid clamp: " + clampStr);
  const nums = m.map(Number);
  const minRem = nums[1];
  const interceptRem = nums[2];
  const slopeVw = nums[3];
  const maxRem = nums[4];
  const midPx = (interceptRem + (slopeVw * vwPx) / 100) * 16;
  return Math.min(Math.max(midPx, minRem * 16), maxRem * 16);
}

function stepByKey(voice: "editorial" | "utilitarian", key: string) {
  const s = buildTypeSteps(voice).find((x) => x.key === key);
  if (!s) throw new Error("missing step " + key);
  return s;
}

describe("fluid() Utopia math", () => {
  test("evaluates to min at 320px and max at 1440px", () => {
    const c = fluid(1.75, 3);
    expect(evalClampAt(c, FLUID_MIN_VIEWPORT_PX)).toBeCloseTo(28, 0);
    expect(evalClampAt(c, FLUID_MAX_VIEWPORT_PX)).toBeCloseTo(48, 0);
  });

  test("is monotonic between the viewports", () => {
    const c = fluid(2.25, 4.5);
    const vals = [320, 480, 768, 1024, 1280, 1440].map((w) =>
      evalClampAt(c, w),
    );
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]).toBeGreaterThan(vals[i - 1]);
    }
  });

  test("middle preferred term carries a rem floor plus vw (zoom-safe)", () => {
    expect(fluid(1, 2)).toMatch(/rem \+ [\d.]+vw/);
  });

  test("deterministic formatting: same inputs, byte-identical output", () => {
    expect(fluid(1.75, 3)).toBe(fluid(1.75, 3));
    expect(fluid(1.75, 3)).toBe("clamp(1.75rem, 1.3929rem + 0.1116vw, 3rem)");
  });
});

describe("body floor", () => {
  test("body is a fixed 1rem: it never shrinks", () => {
    const body = stepByKey("editorial", "body");
    expect(body.size).toBe(BODY_FLOOR_REM + "rem");
    expect(body.size).toBe("1rem");
    expect(body.size).not.toContain("clamp");
  });

  test("no fluid (clamp) step dips below 16px; fixed meta floors are 14px by design", () => {
    for (const voice of ["editorial", "utilitarian"] as const) {
      for (const s of buildTypeSteps(voice)) {
        if (s.size.includes("clamp")) {
          expect(s.minPx).toBeGreaterThanOrEqual(16);
        }
      }
      // Meta floors: small/eyebrow are fixed 14px, like the original's card body.
      const small = buildTypeSteps(voice).find((x) => x.key === "small");
      expect(small && small.size).toBe("0.875rem");
    }
  });
});

describe("hard archaeology numbers (editorial voice)", () => {
  test("hero display: 36px at 320px, 72px at 1440px", () => {
    const d = stepByKey("editorial", "display");
    expect(evalClampAt(d.size, 320)).toBeCloseTo(36, 0);
    expect(evalClampAt(d.size, 1440)).toBeCloseTo(72, 0);
    expect(d.leading).toBe(1.15);
    expect(d.tracking).toBe("-0.02em");
    expect(d.weight).toBe(700);
  });

  test("section h2: 28px at 320px, 48px at 1440px, 36px at the 768px breakpoint", () => {
    const h2 = stepByKey("editorial", "h2");
    expect(evalClampAt(h2.size, 320)).toBeCloseTo(28, 0);
    expect(evalClampAt(h2.size, 1440)).toBeCloseTo(48, 0);
    expect(evalClampAt(h2.size, 768)).toBeCloseTo(36, 0);
    expect(h2.leading).toBe(1.15);
    expect(h2.tracking).toBe("-0.02em");
    expect(h2.weight).toBe(700);
  });

  test("lead/description: 18px to 20px, leading 1.6", () => {
    const lead = stepByKey("editorial", "lead");
    expect(evalClampAt(lead.size, 320)).toBeCloseTo(18, 0);
    expect(evalClampAt(lead.size, 1440)).toBeCloseTo(20, 0);
    expect(lead.leading).toBe(1.6);
  });

  test("four roles present: display, body, meta, button", () => {
    const roles = new Set(buildTypeSteps("editorial").map((s) => s.role));
    expect(roles).toEqual(new Set(["display", "body", "meta", "button"]));
  });

  test("headings balance, prose wraps pretty", () => {
    const d = stepByKey("editorial", "display");
    const body = stepByKey("editorial", "body");
    expect(d.wrap).toBe("balance");
    expect(body.wrap).toBe("pretty");
  });
});

describe("selectTypeVoice", () => {
  const base: TypeVoiceSignals = {
    trade: "unknown",
    longForm: false,
    emergency: false,
  };

  test("owner intent wins over graph signals", () => {
    expect(
      selectTypeVoice({ ...base, trade: "utility", ownerVoice: "editorial" }),
    ).toBe("editorial");
    expect(
      selectTypeVoice({ ...base, trade: "craft", ownerVoice: "utilitarian" }),
    ).toBe("utilitarian");
  });

  test("emergency or utility trade selects utilitarian", () => {
    expect(selectTypeVoice({ ...base, emergency: true })).toBe("utilitarian");
    expect(selectTypeVoice({ ...base, trade: "utility" })).toBe("utilitarian");
  });

  test("craft trade or long-form content selects editorial", () => {
    expect(selectTypeVoice({ ...base, trade: "craft" })).toBe("editorial");
    expect(selectTypeVoice({ ...base, longForm: true })).toBe("editorial");
  });

  test("unknown signals default to editorial", () => {
    expect(selectTypeVoice(base)).toBe("editorial");
  });

  test("deterministic: same signals, same voice", () => {
    const s: TypeVoiceSignals = { trade: "craft", longForm: true, emergency: false };
    expect(selectTypeVoice(s)).toBe(selectTypeVoice({ ...s }));
  });

  test("INVARIANT: no customer-name signal can influence the voice", () => {
    const signals = {
      trade: "craft",
      longForm: false,
      emergency: false,
      customerName: "Acme Plumbing",
      businessName: "Acme Plumbing",
    } as unknown as TypeVoiceSignals;
    expect(selectTypeVoice(signals)).toBe(selectTypeVoice(base));
    // The signals interface itself carries no name-shaped key.
    const keys = ["trade", "longForm", "emergency", "ownerVoice"];
    for (const k of Object.keys(base)) {
      expect(keys).toContain(k);
      expect(k.toLowerCase()).not.toContain("name");
    }
  });
});

describe("emitTypeCssVariables", () => {
  test("pure function of (theme, voice): byte-identical repeats", () => {
    const a = emitTypeCssVariables(DEFAULT_FYD_THEME, "editorial");
    const b = emitTypeCssVariables(DEFAULT_FYD_THEME, "editorial");
    expect(a).toBe(b);
  });

  test("voice changes the emitted scale", () => {
    const fontless = { ...DEFAULT_FYD_THEME, fontDisplay: "", fontBody: "" };
    const ed = emitTypeCssVariables(fontless, "editorial");
    const ut = emitTypeCssVariables(fontless, "utilitarian");
    expect(ed).not.toBe(ut);
    expect(ed).toContain('"Playfair Display"');
    expect(ut).toContain("system-ui");
    expect(ut).not.toContain("Playfair");
  });

  test("theme font stacks override voice defaults", () => {
    const theme = {
      ...DEFAULT_FYD_THEME,
      fontDisplay: "Custom Display, serif",
      fontBody: "Custom Body, sans-serif",
    };
    const css = emitTypeCssVariables(theme, "editorial");
    expect(css).toContain("--fyd-font-display: Custom Display, serif;");
    expect(css).toContain("--fyd-font-body: Custom Body, sans-serif;");
    expect(css).not.toContain("Playfair");
  });

  test("empty theme fonts fall back to voice defaults", () => {
    const theme = { ...DEFAULT_FYD_THEME, fontDisplay: "", fontBody: "" };
    const css = emitTypeCssVariables(theme, "editorial");
    expect(css).toContain('"Playfair Display"');
  });

  test("emits the 65ch measure tokens", () => {
    const css = emitTypeCssVariables(DEFAULT_FYD_THEME, "editorial");
    expect(css).toContain("--fyd-measure: 65ch;");
    expect(css).toContain("--fyd-measure-narrow: 60ch;");
  });

  test("no em dashes in emitted CSS", () => {
    const css = emitTypeCssVariables(DEFAULT_FYD_THEME, "editorial");
    expect(css).not.toContain("—");
  });
});

describe("emitTypeRoleClasses", () => {
  test("every step gets a .fyd-type-<key> class with the role family", () => {
    const css = emitTypeRoleClasses("editorial");
    expect(css).toContain(".fyd-type-display {");
    expect(css).toContain("font-size: var(--fyd-type-display);");
    expect(css).toContain("font-family: var(--fyd-font-display);");
    expect(css).toContain(".fyd-type-body {");
    expect(css).toContain("font-family: var(--fyd-font-body);");
  });

  test("headings get text-wrap balance, prose gets pretty", () => {
    const css = emitTypeRoleClasses("editorial");
    expect(css).toMatch(/\.fyd-type-h2 \{[^}]*text-wrap: balance;/);
    expect(css).toMatch(/\.fyd-type-body \{[^}]*text-wrap: pretty;/);
  });

  test("eyebrow is uppercase with 0.12em tracking", () => {
    const css = emitTypeRoleClasses("editorial");
    expect(css).toMatch(/\.fyd-type-eyebrow \{[^}]*text-transform: uppercase;/);
    expect(emitTypeCssVariables(DEFAULT_FYD_THEME, "editorial")).toContain(
      "--fyd-type-eyebrow-tracking: 0.12em;",
    );
  });

  test("deterministic and em-dash free", () => {
    const a = emitTypeRoleClasses("editorial");
    expect(a).toBe(emitTypeRoleClasses("editorial"));
    expect(a).not.toContain("—");
  });
});
