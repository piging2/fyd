/**
 * PING Social brand identity for the ping-fyd dogfood site.
 *
 * Presentation tokens ONLY: colors, fonts, radius. No facts, no fields,
 * no private data. Applied in this page's own page.tsx over the compiled
 * spec's themeTokens, so other sites (Coppersmith, Happy Place) keep the
 * default theme untouched.
 *
 * Identity: warm paper surface, deep slate ink, vermilion accent, grotesque
 * display type (Geist, tight and bold) instead of the default Playfair
 * serif + gold. PING should read as the AI concierge shop, not as another
 * default-theme demo.
 */
import type { FYDThemeTokens, FYDSiteSpec } from "@/fyd/sitespec/types";

export const PING_BRAND_TOKENS: Partial<FYDThemeTokens> = {
  surface: "#FAF6ED",
  ink: "#1C2430",
  accent: "#D9481C",
  accentForeground: "#FFF9F3",
  fontDisplay: "Geist, system-ui, sans-serif",
  fontBody: "Geist, system-ui, sans-serif",
  radius: "lg",
};

/**
 * Return a copy of the spec with the PING brand tokens applied over the
 * compiled theme tokens. Pure: never mutates the input spec.
 */
export function applyPingBrand(spec: FYDSiteSpec): FYDSiteSpec {
  return {
    ...spec,
    themeTokens: { ...spec.themeTokens, ...PING_BRAND_TOKENS },
  };
}
