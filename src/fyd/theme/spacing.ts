/**
 * Lane 6: FYD section spacing scale. Visual grammar v1, spacing dimension.
 *
 * Restores the HPP archaeology rhythm: major sections breathe at
 * 96/128px on desktop (64px compressed on mobile via the same
 * clamp() fluid mechanism as the type scale), minor sections at
 * 64/80px, the container at 1280px, cards at 12px radius with a warm
 * layered shadow. Pure functions of the theme; deterministic output.
 *
 * Sources: findings/hpp-archaeology.md section 3 (major py-24/py-32,
 * minor py-16/py-20, container 1280, card radius 12px, mounted-photo
 * shadows) and section 9 (card geometry), findings/design-corpus.md
 * P11 (compress from the top, never shrink from the bottom).
 */

import type { FYDThemeTokens } from "../sitespec/types";
import { fluid } from "./type-scale";

/** Container width: 1280px, the original's max-w-7xl. */
export const CONTAINER_MAX_REM = 80;

/** Card geometry: 12px radius, mounted-photo warm shadow. */
export const CARD_RADIUS_REM = 0.75;
export const CARD_SHADOW = "0 22px 46px -28px rgba(53, 36, 35, 0.18)";
export const CARD_SHADOW_HOVER = "0 30px 60px -24px rgba(53, 36, 35, 0.3)";

/** The section spacing tokens this module emits. */
export interface SectionSpacingTokens {
  /** Major section vertical padding: 64px at 320px -> 128px at 1440px. */
  sectionMajor: string;
  /** Minor section vertical padding: 48px at 320px -> 80px at 1440px. */
  sectionMinor: string;
  /** Gap between cards in a grid: 20px -> 24px. */
  cardGap: string;
  /** Eyebrow-to-title stack gap (original mt-4). */
  stackEyebrow: string;
  /** Title-to-description stack gap (original mt-5). */
  stackDescription: string;
  /** Max content width, rem. */
  containerMax: string;
  /** Card radius, rem. */
  cardRadius: string;
  /** Card shadow (rest). */
  cardShadow: string;
  /** Card shadow (hover lift). */
  cardShadowHover: string;
}

/** Build the section spacing tokens. Pure; theme may override the
 * container width via the existing layout.contentMaxWidth token. */
export function buildSectionSpacing(theme: FYDThemeTokens): SectionSpacingTokens {
  const containerPx = theme.layout?.contentMaxWidth ?? CONTAINER_MAX_REM * 16;
  return {
    sectionMajor: fluid(4, 8),
    sectionMinor: fluid(3, 5),
    cardGap: fluid(1.25, 1.5),
    stackEyebrow: "1rem",
    stackDescription: "1.25rem",
    containerMax: containerPx / 16 + "rem",
    cardRadius: CARD_RADIUS_REM + "rem",
    cardShadow: CARD_SHADOW,
    cardShadowHover: CARD_SHADOW_HOVER,
  };
}

/**
 * Emit the spacing CSS custom properties. Pure function of theme.
 * --fyd-space-* merge with the existing token pipeline; the renderer
 * injects these inline per theme and globals.css carries :root
 * fallbacks.
 */
export function emitSpacingCssVariables(theme: FYDThemeTokens): string {
  const s = buildSectionSpacing(theme);
  return [
    "--fyd-space-section-major: " + s.sectionMajor + ";",
    "--fyd-space-section-minor: " + s.sectionMinor + ";",
    "--fyd-space-card-gap: " + s.cardGap + ";",
    "--fyd-space-stack-eyebrow: " + s.stackEyebrow + ";",
    "--fyd-space-stack-description: " + s.stackDescription + ";",
    "--fyd-container-max: " + s.containerMax + ";",
    "--fyd-radius-card: " + s.cardRadius + ";",
    "--fyd-shadow-card: " + s.cardShadow + ";",
    "--fyd-shadow-card-hover: " + s.cardShadowHover + ";",
  ].join("\n");
}
