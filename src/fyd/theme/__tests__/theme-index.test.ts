/**
 * Lane 6 tests: theme barrel (index.ts).
 *
 * 1. resolveTypeVoice precedence: explicit typeVoice > signals > default.
 * 2. emitFydThemeCss: pure function of (theme, voice); snapshot-pinned.
 * 3. The extension is additive: DEFAULT_FYD_THEME (no new fields)
 *    still emits the full block unchanged.
 *
 * Run: npx jest --config src/fyd/theme/jest.config.cjs
 */

import { DEFAULT_FYD_THEME } from "../../sitespec/types";
import {
  emitFydThemeCss,
  emitFydThemeCssForTheme,
  resolveTypeVoice,
} from "../index";

describe("resolveTypeVoice", () => {
  test("explicit typeVoice wins", () => {
    expect(
      resolveTypeVoice({
        ...DEFAULT_FYD_THEME,
        typeVoice: "utilitarian",
        typeVoiceSignals: { trade: "craft", longForm: true, emergency: false },
      }),
    ).toBe("utilitarian");
  });

  test("signals decide when no explicit voice", () => {
    expect(
      resolveTypeVoice({
        ...DEFAULT_FYD_THEME,
        typeVoiceSignals: { trade: "utility", longForm: false, emergency: false },
      }),
    ).toBe("utilitarian");
  });

  test("default is editorial when nothing is set", () => {
    expect(resolveTypeVoice(DEFAULT_FYD_THEME)).toBe("editorial");
  });

  test("deterministic", () => {
    const theme = { ...DEFAULT_FYD_THEME, typeVoice: "editorial" as const };
    expect(resolveTypeVoice(theme)).toBe(resolveTypeVoice(theme));
  });
});

describe("emitFydThemeCss", () => {
  test("pure: byte-identical repeats", () => {
    const a = emitFydThemeCss(DEFAULT_FYD_THEME, "editorial");
    expect(a).toBe(emitFydThemeCss(DEFAULT_FYD_THEME, "editorial"));
  });

  test("carries both type and spacing variables plus role classes", () => {
    const css = emitFydThemeCss(DEFAULT_FYD_THEME, "editorial");
    expect(css).toContain("--fyd-font-display:");
    expect(css).toContain("--fyd-type-h2:");
    expect(css).toContain("--fyd-space-section-major:");
    expect(css).toContain("--fyd-container-max:");
    expect(css).toContain(".fyd-type-display {");
    expect(css).toContain(":root {");
  });

  test("voice is stamped in the header comment", () => {
    expect(emitFydThemeCss(DEFAULT_FYD_THEME, "utilitarian")).toContain(
      "voice: utilitarian",
    );
  });

  test("no em dashes anywhere in the emitted block", () => {
    expect(emitFydThemeCss(DEFAULT_FYD_THEME, "editorial")).not.toContain("—");
  });

  test("snapshot of the full emitted block", () => {
    expect(emitFydThemeCss(DEFAULT_FYD_THEME, "editorial")).toMatchSnapshot();
  });
});

describe("emitFydThemeCssForTheme", () => {
  test("resolves the voice from the theme itself", () => {
    const ed = emitFydThemeCssForTheme(DEFAULT_FYD_THEME);
    const ut = emitFydThemeCssForTheme({
      ...DEFAULT_FYD_THEME,
      typeVoice: "utilitarian",
    });
    expect(ed).toBe(emitFydThemeCss(DEFAULT_FYD_THEME, "editorial"));
    expect(ut).toBe(emitFydThemeCss(DEFAULT_FYD_THEME, "utilitarian"));
  });

  test("additive: a theme with no new fields still emits the full block", () => {
    const css = emitFydThemeCssForTheme(DEFAULT_FYD_THEME);
    expect(css).toContain("--fyd-type-body: 1rem;");
    expect(css).toContain("--fyd-radius-card: 0.75rem;");
  });
});
