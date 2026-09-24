/**
 * FYD media design tokens (lane-contained).
 *
 * Steering binding (FYD mobile object experience rebuild, 2026-09-23):
 * brand-aware contrast handling belongs to PresentationSpec/design
 * tokens, never a literal RGB complement. This module is the lane's
 * design-token authority for media surfaces: deterministic palette
 * derivation from object tokens, and a luminance-based foreground
 * picker that chooses between the two brand foreground tokens.
 *
 * A literal RGB complement (hue + 180) is never computed anywhere in
 * this module. The companion hue is analogous (stays near the warm
 * band); contrast comes from lightness, not from opposing hues.
 *
 * Pure functions. No network, no randomness, no hardcoded URLs.
 */

import { createHash } from "node:crypto";

/** Warm paper: the light brand foreground token (text on dark). */
export const FOREGROUND_ON_DARK = "#fff8ef";
/** Deep espresso: the dark brand foreground token (text on light). */
export const FOREGROUND_ON_LIGHT = "#2b1a12";

/** Warm artisan hue band: 18 (burnt orange) through 42 (amber). */
export const HUE_MIN = 18;
/** Band width: hues 18..42 inclusive. */
export const HUE_SPAN = 25;

export interface MediaPalette {
  /** Primary hue, always inside the warm artisan band. */
  hue: number;
  /** Analogous companion hue (hue + 24). Never a complement. */
  hue2: number;
  saturation: number;
  /** Lightness of the bright stop (percent). */
  light: number;
  /** Lightness of the deep stop (percent). */
  dark: number;
}

/** sha256 hex of a seed string. The deterministic token primitive. */
export function tokenDigest(seed: string): string {
  return createHash("sha256").update(seed, "utf8").digest("hex");
}

/**
 * Deterministic brand palette from an arbitrary seed string.
 * Same seed -> byte-identical palette.
 */
export function paletteFor(seed: string): MediaPalette {
  const hash = createHash("sha256").update(seed, "utf8").digest();
  const hue = HUE_MIN + (hash[0] % HUE_SPAN);
  return { hue, hue2: hue + 24, saturation: 45, light: 62, dark: 38 };
}

/**
 * CSS radial gradient for a palette. Mirrors the lane's established
 * warm-gradient treatment so generated surfaces feel like one brand.
 */
export function gradientCss(p: MediaPalette): string {
  return (
    "radial-gradient(circle at 35% 30%, hsl(" +
    p.hue +
    " " +
    p.saturation +
    "% " +
    p.light +
    "%), hsl(" +
    (p.hue - 12) +
    " " +
    p.saturation +
    "% " +
    p.dark +
    "%))"
  );
}

/**
 * Brand-aware foreground choice. The background lightness decides
 * between the two brand foreground tokens; the hue never changes and
 * no complement is ever computed. Deterministic.
 */
export function foregroundForLightness(lightness: number): string {
  return lightness < 55 ? FOREGROUND_ON_DARK : FOREGROUND_ON_LIGHT;
}

export interface ObjectMediaTokens {
  palette: MediaPalette;
  /** Display initial: first letter of the title, uppercased. */
  initial: string;
  /** Foreground token chosen for the palette's bright stop. */
  foreground: string;
  /** The token digest (reproducibility recipe). */
  digest: string;
}

/**
 * The full deterministic token set for an object. Everything a
 * generated treatment needs, derived from objectId + title only.
 */
export function tokensForObject(
  objectId: string,
  title: string,
): ObjectMediaTokens {
  const seed = objectId + "\n" + title;
  const palette = paletteFor(seed);
  const first = title.trim()[0];
  return {
    palette,
    initial: (typeof first === "string" ? first : "").toUpperCase() || "?",
    foreground: foregroundForLightness(palette.light),
    digest: tokenDigest(seed),
  };
}
