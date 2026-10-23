/**
 * Item 9 (fyd-execution) regression: INV-RM-3 logo discipline.
 *
 * A logo displayed at N CSS px must use the smallest manifest variant >=
 * 2N (retina-honest); when no variant reaches 2N, the largest available
 * below it; never an upscaled width; null when no content variant exists
 * (the caller renders the typographic fallback, never an invented image).
 */

import { pickLogoVariant, type HonestVariant } from "../responsive";

const v = (width: number): HonestVariant => ({
  name: `w${width}`,
  width,
  height: Math.round(width / 2),
  url: `/fyd-media/logo/w${width}.webp`,
});

test("picks the smallest variant >= 2x display width", () => {
  const variants = [v(64), v(128), v(400)];
  expect(pickLogoVariant(variants, 64)?.width).toBe(128);
});

test("single available derivative is used as-is (never upscaled)", () => {
  // The real manifests only mint a 400w logo derivative: it is the only
  // safe choice, and it must not be presented as anything wider.
  expect(pickLogoVariant([v(400)], 64)?.width).toBe(400);
});

test("falls back to the largest available below 2x (never upscale)", () => {
  const variants = [v(400), v(800)];
  const picked = pickLogoVariant(variants, 500);
  expect(picked?.width).toBe(800);
  expect(picked!.width).toBeLessThan(1000);
});

test("returns null when no content variant exists", () => {
  expect(pickLogoVariant([], 64)).toBeNull();
  expect(
    pickLogoVariant(
      [{ name: "blur", width: 10, height: 7, url: "/fyd-media/logo/blur-10w.webp" }],
      64,
    ),
  ).toBeNull();
});

test("order of the manifest list does not matter", () => {
  const variants = [v(400), v(64), v(128)];
  expect(pickLogoVariant(variants, 64)?.width).toBe(128);
});
