/**
 * Design compiler seam (sketch, additive): SiteSpec -> design intent ->
 * compiled shell tokens.
 *
 * Mobile architecture (Nolan, additive directive): the SiteSpec should
 * control SEMANTIC design tokens (density, radius, type scale, spacing
 * rhythm, surface depth, motion intensity, media treatment, content
 * width, object emphasis), never arbitrary CSS. The flow is: agent
 * proposes design intent -> deterministic token system renders it ->
 * owner approves -> regeneration preserves it.
 *
 * Alignment note: the SiteSpec already carries semantic tokens
 * (FYDThemeTokens: radius, typography, spacing, surfaces, shadows,
 * layout, breakpoints, media, motion). What was missing: density and
 * object emphasis, and a deterministic mapping from those tokens onto
 * the FYD interaction shell. This module is that mapping. It is pure
 * and deterministic: the same intent always compiles to the same
 * shell.
 *
 * fyd-shell.ts already consumes this compiler for its default output,
 * proving the mapping reproduces the shipped values. Per-spec
 * consumption (threading a compiled shell from the active SiteSpec
 * through the object layer instead of the default) is the next step,
 * not this one.
 */

import type { FYDThemeTokens } from "@/fyd/sitespec/types";

/**
 * Semantic design intent: what the agent proposes and the owner
 * approves. No px anywhere except contentWidth; everything else is a
 * named choice the compiler renders deterministically.
 */
export interface FydDesignIntent {
  /** Compact reduces spacing rhythm and information density. */
  density: "comfortable" | "compact";
  radiusScale: "none" | "sm" | "md" | "lg" | "full";
  typeScale: { base: number; ratio: number };
  spacingRhythm: { xs: number; sm: number; md: number; lg: number; xl: number };
  surfaceDepth: "flat" | "raised" | "deep";
  motionIntensity: "NONE" | "SUBTLE" | "EXPRESSIVE";
  mediaTreatment: "documentary" | "polished" | "schematic";
  /** Max content width in px. */
  contentWidth: number;
  /**
   * How loudly objects announce themselves. FYD whispers at rest:
   * "quiet" is the product default; "prominent" is reserved for
   * explicit owner choice.
   */
  objectEmphasis: "quiet" | "standard" | "prominent";
}

export const DEFAULT_DESIGN_INTENT: FydDesignIntent = {
  density: "comfortable",
  radiusScale: "md",
  typeScale: { base: 14, ratio: 1.2 },
  spacingRhythm: { xs: 4, sm: 8, md: 16, lg: 20, xl: 32 },
  surfaceDepth: "raised",
  motionIntensity: "SUBTLE",
  mediaTreatment: "documentary",
  contentWidth: 1200,
  objectEmphasis: "quiet",
};

/**
 * Pure: read the semantic design intent out of a SiteSpec's theme
 * tokens. Every field has a deterministic default, so specs written
 * before a token existed compile unchanged. Density and
 * objectEmphasis have no SiteSpec token yet; they default here until
 * the spec grows them additively.
 */
export function designIntentFromTheme(theme: FYDThemeTokens): FydDesignIntent {
  return {
    density: "comfortable",
    radiusScale: theme.radius ?? "md",
    typeScale: theme.typography ?? { base: 14, ratio: 1.2 },
    spacingRhythm: theme.spacing ?? { xs: 4, sm: 8, md: 16, lg: 20, xl: 32 },
    surfaceDepth: "raised",
    motionIntensity: "SUBTLE",
    mediaTreatment: theme.media?.treatment ?? "documentary",
    contentWidth: theme.layout?.contentMaxWidth ?? 1200,
    objectEmphasis: "quiet",
  };
}

/** The compiled shell: scalar, directly usable values. */
export interface CompiledShell {
  radius: { peek: number; workspace: number; control: number; chip: number };
  spacing: {
    peekPad: number;
    workspacePad: number;
    sectionGap: number;
    rowGap: number;
  };
  type: { name: number; desc: number; action: number; caption: number };
  elevation: { peek: string; workspace: string };
  touchTarget: number;
}

const RADIUS_TABLE: Record<
  FydDesignIntent["radiusScale"],
  CompiledShell["radius"]
> = {
  none: { peek: 0, workspace: 0, control: 0, chip: 999 },
  sm: { peek: 8, workspace: 10, control: 6, chip: 999 },
  md: { peek: 16, workspace: 18, control: 10, chip: 999 },
  lg: { peek: 24, workspace: 24, control: 14, chip: 999 },
  full: { peek: 28, workspace: 28, control: 999, chip: 999 },
};

const ELEVATION_TABLE: Record<
  FydDesignIntent["surfaceDepth"],
  CompiledShell["elevation"]
> = {
  flat: { peek: "none", workspace: "none" },
  raised: {
    peek: "0 12px 32px rgba(26,23,41,0.14), 0 2px 8px rgba(26,23,41,0.08)",
    workspace: "0 24px 64px rgba(26,23,41,0.18), 0 4px 16px rgba(26,23,41,0.10)",
  },
  deep: {
    peek: "0 20px 48px rgba(26,23,41,0.22), 0 4px 12px rgba(26,23,41,0.12)",
    workspace: "0 36px 88px rgba(26,23,41,0.26), 0 8px 24px rgba(26,23,41,0.14)",
  },
};

/**
 * Pure: compile a design intent into shell tokens. The default intent
 * reproduces the shipped shell values exactly (pinned by test); a
 * compact density tightens the spacing rhythm deterministically.
 */
export function compileShell(intent: FydDesignIntent): CompiledShell {
  const r = intent.spacingRhythm;
  const tighten = intent.density === "compact" ? 0.75 : 1;
  const px = (v: number): number => Math.round(v * tighten);
  const base = intent.typeScale.base;
  return {
    radius: RADIUS_TABLE[intent.radiusScale],
    spacing: {
      peekPad: px(r.md),
      workspacePad: px(r.lg),
      sectionGap: px(r.md),
      rowGap: px(r.sm),
    },
    type: {
      name: base + 1,
      desc: base - 1,
      action: base,
      caption: base - 2,
    },
    elevation: ELEVATION_TABLE[intent.surfaceDepth],
    touchTarget: 44,
  };
}
