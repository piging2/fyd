/**
 * hero-scrim: pure contrast math for the photographic hero.
 *
 * The full-bleed hero lays light copy over an arbitrary photograph. This
 * module computes the minimum black-overlay opacity that keeps the copy at
 * WCAG AA (4.5:1) against a WORST-CASE white photograph, and builds the
 * localized scrim background from that opacity.
 *
 * Why worst-case white: the photograph is tenant-supplied and unknown at
 * build time. Computing against white guarantees the ratio for any photo;
 * computing against the actual photo would need the pixels at render time
 * and could silently pass a dark photo while failing a bright one.
 *
 * The scrim is a uniform base at the computed alpha (the AA guarantee holds
 * for text anywhere on the photo) plus a bottom-weighted deepening for the
 * editorial copy zone. Pure: no DOM, no React, unit-tested.
 */

export interface HeroFocalPoint {
  x: number;
  y: number;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of a #rrggbb color. Throws on malformed input. */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb)
    throw new Error(`hero-scrim: expected #rrggbb, got ${JSON.stringify(hex)}`);
  const [r, g, b] = rgb.map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio from two luminances (lighter first). */
export function contrastRatio(lighter: number, darker: number): number {
  return (lighter + 0.05) / (darker + 0.05);
}

function mixTowardWhite(
  target: [number, number, number],
  alpha: number,
): string {
  const mixed = [255, 255, 255].map((c, i) =>
    Math.round(c * (1 - alpha) + target[i] * alpha),
  );
  return (
    "#" + mixed.map((c) => c.toString(16).padStart(2, "0")).join("")
  );
}

/**
 * The worst-case photograph (pure white) seen through a black overlay at
 * `alpha`, as a #rrggbb color. The AA guarantee is computed against this
 * composite, so it holds for any real photograph.
 */
export function compositePhotoUnderScrim(alpha: number): string {
  return mixTowardWhite([0, 0, 0], alpha);
}

/**
 * WCAG contrast ratio of `textHex` copy against the worst-case photograph
 * seen through a black overlay at `alpha`.
 */
export function textOverPhotoContrast(
  alpha: number,
  textHex = "#ffffff",
): number {
  const textLum = relativeLuminance(textHex);
  const photoLum = relativeLuminance(compositePhotoUnderScrim(alpha));
  const [lighter, darker] =
    textLum >= photoLum ? [textLum, photoLum] : [photoLum, textLum];
  return contrastRatio(lighter, darker);
}

/**
 * Minimum black-overlay opacity (0..1) so `textHex` copy keeps
 * `targetRatio` contrast against a worst-case white photograph seen
 * through the overlay. Monotonic in alpha, solved by bisection and
 * rounded UP to 3 decimals so the returned value always meets the ratio.
 */
export function minScrimOpacityForAa(
  textHex = "#ffffff",
  targetRatio = 4.5,
): number {
  const contrastAt = (alpha: number): number =>
    textOverPhotoContrast(alpha, textHex);
  if (contrastAt(1) < targetRatio) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (contrastAt(mid) >= targetRatio) hi = mid;
    else lo = mid;
  }
  return Math.ceil(hi * 1000) / 1000;
}

/**
 * The scrim background for a computed alpha: a uniform base at alpha (the
 * AA guarantee, valid for text anywhere on the photo) deepening toward
 * the bottom copy zone. Deterministic string for a deterministic alpha.
 */
export function heroScrimBackground(alpha: number): string {
  const a = Math.min(1, Math.max(0, alpha));
  const deep = Math.min(1, a + 0.15);
  const f = (v: number) => v.toFixed(3);
  return (
    `linear-gradient(to top, rgba(0, 0, 0, ${f(deep)}) 0%, ` +
    `rgba(0, 0, 0, ${f(a)}) 45%, rgba(0, 0, 0, ${f(a)}) 100%)`
  );
}

/**
 * Focal point threaded from the server seam: the media manifest's
 * focalPoint attached to the hero DisplayMedia by the page (DisplayMedia
 * itself carries no focal point). Validated and clamped to 0..1; any
 * malformed value falls back to null (the hero centers the photo).
 */
export function heroFocalPointOf(hero: unknown): HeroFocalPoint | null {
  if (!hero || typeof hero !== "object") return null;
  const fp = (hero as { focalPoint?: unknown }).focalPoint;
  if (!fp || typeof fp !== "object") return null;
  const { x, y } = fp as { x?: unknown; y?: unknown };
  if (typeof x !== "number" || typeof y !== "number") return null;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return { x: clamp(x), y: clamp(y) };
}
