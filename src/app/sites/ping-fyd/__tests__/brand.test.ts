/**
 * PING brand tokens: presentation only, distinct from the default theme,
 * pure application (no spec mutation).
 */
import { DEFAULT_FYD_THEME, type FYDSiteSpec } from "@/fyd/sitespec/types";
import { PING_BRAND_TOKENS, applyPingBrand } from "../brand";

const HEX = /^#[0-9a-fA-F]{6}$/;

function stubSpec(): FYDSiteSpec {
  return {
    kind: "fyd.sitespec@1",
    ownerObjectId: "owner-1",
    version: 1,
    generator: { name: "fyd-site-generator", version: "test", generatedAt: "2026-10-05T00:00:00Z" },
    themeTokens: { ...DEFAULT_FYD_THEME },
    navigation: [],
    pages: [],
    provenance: {
      source: "website-ingestion",
      claimKind: "website_statement",
      note: "test stub",
    },
  };
}

describe("PING brand tokens", () => {
  test("identity differs from the default theme on every brand axis", () => {
    expect(PING_BRAND_TOKENS.accent).not.toBe(DEFAULT_FYD_THEME.accent);
    expect(PING_BRAND_TOKENS.surface).not.toBe(DEFAULT_FYD_THEME.surface);
    expect(PING_BRAND_TOKENS.ink).not.toBe(DEFAULT_FYD_THEME.ink);
    expect(PING_BRAND_TOKENS.fontDisplay).not.toBe(DEFAULT_FYD_THEME.fontDisplay);
  });

  test("colors are valid 6-digit hex, fonts are non-empty stacks", () => {
    for (const key of ["surface", "ink", "accent", "accentForeground"] as const) {
      expect(PING_BRAND_TOKENS[key]).toMatch(HEX);
    }
    expect(PING_BRAND_TOKENS.fontDisplay).toMatch(/\S/);
    expect(PING_BRAND_TOKENS.fontBody).toMatch(/\S/);
  });

  test("applyPingBrand overrides tokens without mutating the input spec", () => {
    const spec = stubSpec();
    const before = JSON.stringify(spec.themeTokens);
    const branded = applyPingBrand(spec);
    expect(JSON.stringify(spec.themeTokens)).toBe(before);
    expect(branded.themeTokens.accent).toBe(PING_BRAND_TOKENS.accent);
    expect(branded.themeTokens.surface).toBe(PING_BRAND_TOKENS.surface);
    expect(branded.themeTokens.fontDisplay).toBe(PING_BRAND_TOKENS.fontDisplay);
    // Untouched axes survive from the compiled spec.
    expect(branded.themeTokens.layoutCharacter).toBe(spec.themeTokens.layoutCharacter);
    expect(branded.pages).toBe(spec.pages);
  });
});
