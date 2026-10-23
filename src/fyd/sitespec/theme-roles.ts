/**
 * Item 4 (fyd-execution, 2026-10-07): semantic token roles + WCAG contrast math.
 *
 * The defect: exactly one `accent` token was used as TEXT color in two render
 * paths while measuring 2.42:1 on the default surface (fails WCAG AA 4.5:1),
 * and nothing stopped an invalid foreground/background pairing from shipping.
 *
 * The invariant:
 * 1. SiteSpec carries base tokens (accent, surface, ink, ...) AND derived
 *    semantic roles: accentDecorative (decoration only, NEVER text),
 *    accentText (accent adjusted to guarantee >=4.5:1 on surface),
 *    foreground, mutedForeground (>=4.5:1 on surface; muted text is still
 *    text), surface, surfaceForeground (elevated surface tone), onAccent
 *    (text on an accent background).
 * 2. Components bind ONLY to roles, never to raw accent/ink in a text
 *    position. Raw tokens remain for decoration (borders, fills, marks).
 * 3. Roles derive deterministically from base tokens (pure functions of the
 *    palette), so owner-chosen or graph-derived palettes are validated AND
 *    repaired at compile time, not hand-patched per label.
 *
 * EVIDENCE != VISIBILITY: untouched. No ClaimAuthority: this module computes
 * color facts only; the binding verifier still owns factual renderability.
 */

import type { FYDThemeTokens } from "./types";

/** WCAG AA minimum contrast for text. Uniform 4.5:1 for every text role. */
export const CONTRAST_TEXT_THRESHOLD = 4.5;

/** Seed for mutedForeground when the spec carries no explicit muted color. */
export const DEFAULT_MUTED_SEED = "#536469";

export interface FYDThemeRoles {
  /**
   * Brand accent for decoration ONLY (borders, fills, brand marks). May be
   * below the text contrast threshold; NEVER used as text.
   */
  accentDecorative: string;
  /** Accent adjusted to >=4.5:1 on surface. The only accent for text. */
  accentText: string;
  /** Primary text on surface. Defaults to ink. */
  foreground: string;
  /** Secondary text on surface. Still text: always >=4.5:1 on surface. */
  mutedForeground: string;
  /** Page background. */
  surface: string;
  /** Elevated surface tone (cards, sheets). Derived from surface. */
  surfaceForeground: string;
  /** Text on an accent background. Defaults to accentForeground. */
  onAccent: string;
}

type RGB = [number, number, number];

/** Strict 6-digit hex only: theme tokens are concrete colors, never names. */
export function parseHexColor(value: string): RGB | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(value.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function isValidHexColor(value: string): boolean {
  return parseHexColor(value) !== null;
}

function toHex([r, g, b]: RGB): string {
  const h = (c: number) => Math.round(c).toString(16).padStart(2, "0");
  return "#" + h(r) + h(g) + h(b);
}

function linearChannel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance. Pure and deterministic. */
export function relativeLuminance(rgb: RGB): number {
  return (
    0.2126 * linearChannel(rgb[0]) +
    0.7152 * linearChannel(rgb[1]) +
    0.0722 * linearChannel(rgb[2])
  );
}

/**
 * WCAG contrast ratio. Returns null when either value is not a valid hex
 * color (callers surface that as a validation finding, never as 1:1).
 */
export function contrastRatio(fg: string, bg: string): number | null {
  const f = parseHexColor(fg);
  const b = parseHexColor(bg);
  if (!f || !b) return null;
  const l1 = relativeLuminance(f);
  const l2 = relativeLuminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/** Linear-RGB mix of two hex colors. t=0 -> a, t=1 -> b. Null on bad input. */
export function mixHexColors(a: string, b: string, t: number): string | null {
  const ca = parseHexColor(a);
  const cb = parseHexColor(b);
  if (!ca || !cb) return null;
  const mix = (x: number, y: number) => x + (y - x) * t;
  return toHex([mix(ca[0], cb[0]), mix(ca[1], cb[1]), mix(ca[2], cb[2])]);
}

/**
 * Repair a foreground color so it meets the threshold on the background:
 * mix it toward whichever pole (black/white) contrasts better, in 1% steps,
 * stopping at the first passing value. Deterministic: same input, same
 * output, every site, every render. Unparseable input passes through
 * unchanged (the validator flags it; derivation never invents a color).
 */
export function ensureTextContrast(
  fg: string,
  bg: string,
  threshold: number = CONTRAST_TEXT_THRESHOLD,
): string {
  const ratio = contrastRatio(fg, bg);
  if (ratio === null || ratio >= threshold) return fg;
  const blackOnBg = contrastRatio("#000000", bg) ?? 1;
  const whiteOnBg = contrastRatio("#ffffff", bg) ?? 1;
  const pole = blackOnBg >= whiteOnBg ? "#000000" : "#ffffff";
  for (let step = 1; step <= 100; step++) {
    const candidate = mixHexColors(fg, pole, step / 100);
    if (candidate === null) return fg;
    const r = contrastRatio(candidate, bg);
    if (r !== null && r >= threshold) return candidate;
  }
  return pole;
}

/**
 * Resolve the full role set for a theme. Every role is guaranteed present:
 * explicit spec roles win, absent roles derive deterministically from the
 * base palette. Old specs (base tokens only) resolve unchanged in behavior:
 * foreground == ink, onAccent == accentForeground, accentDecorative == accent.
 */
export function resolveThemeRoles(tokens: FYDThemeTokens): FYDThemeRoles {
  const surface = tokens.surface;
  const foreground = tokens.foreground ?? tokens.ink;
  return {
    accentDecorative: tokens.accentDecorative ?? tokens.accent,
    accentText: tokens.accentText ?? ensureTextContrast(tokens.accent, surface),
    foreground,
    mutedForeground:
      tokens.mutedForeground ??
      ensureTextContrast(tokens.colors?.muted ?? DEFAULT_MUTED_SEED, surface),
    surface,
    surfaceForeground:
      tokens.surfaceForeground ?? mixHexColors(surface, foreground, 0.045) ?? surface,
    onAccent: tokens.onAccent ?? tokens.accentForeground,
  };
}
