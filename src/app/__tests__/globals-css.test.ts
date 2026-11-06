/**
 * globals-css.test.ts — pins the shared accessibility floor in
 * src/app/globals.css (website UI audit 2026-11-01, findings F2/F3/F6):
 *
 *  1. Exactly one :focus-visible rule exists (a duplicate pair drifted
 *     apart once; the later rule silently won).
 *  2. The focus outline uses the dedicated --color-focus token, and that
 *     token clears the WCAG 3:1 non-text contrast floor against BOTH the
 *     light page background and the deep dark-section colour. (Plain
 *     --color-honey #C9A227 only reaches ~2.3:1 on the light background.)
 *  3. html carries scroll-padding-top of at least the sticky header's
 *     height (h-20 = 80px) so anchored / keyboard-focused content is not
 *     hidden underneath it (WCAG 2.4.11).
 *
 * Source-level pin, same convention as layout-hydration.test.ts: the
 * contract under test is the stylesheet text itself.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CSS_PATH = join(__dirname, "..", "globals.css");
const css = readFileSync(CSS_PATH, "utf8");

function tokenHex(name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`));
  if (!m) throw new Error(`token --${name} not found as a 6-digit hex in globals.css`);
  return m[1];
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

describe("globals.css accessibility floor", () => {
  it("defines exactly one :focus-visible rule", () => {
    const rules = css.match(/:focus-visible\s*\{/g) ?? [];
    expect(rules.length).toBe(1);
  });

  it("focus outline uses --color-focus and clears 3:1 on light and dark surfaces", () => {
    const rule = css.match(/:focus-visible\s*\{[^}]*\}/);
    if (!rule) throw new Error("no :focus-visible rule found");
    expect(rule[0]).toContain("var(--color-focus)");
    const focus = tokenHex("color-focus");
    expect(contrastRatio(focus, tokenHex("color-background"))).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(focus, tokenHex("color-deep"))).toBeGreaterThanOrEqual(3);
  });

  it("hero parallax stays behind the reduced-motion guard", () => {
    expect(css).toContain(".hero-parallax");
    expect(css).toContain(".hero-signal-field");
    expect(css).toContain("@keyframes signalDrift");
    expect(css).toContain("prefers-reduced-motion: no-preference");
    expect(css).toContain("animation-timeline: view(block)");
  });

  it("offsets anchored content below the 80px sticky header", () => {
    const m = css.match(/scroll-padding-top:\s*([0-9.]+)rem/);
    if (!m) throw new Error("scroll-padding-top (rem) not set in globals.css");
    expect(parseFloat(m[1]) * 16).toBeGreaterThanOrEqual(80);
  });
});
