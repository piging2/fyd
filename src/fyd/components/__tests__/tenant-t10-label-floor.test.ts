/**
 * tenant-t10-label-floor.test.ts — pins Website UI audit 2026-11-01
 * finding T10: a factory floor of 12px for any visible label.
 *
 * Breaches fixed in this lane: ClaimBadge at text-[11px], the
 * Circle context pill at text-[10px], the edge sheet's claim and
 * tag chips at 0.68rem (~10.9px), and the VisitorExperience eyebrow,
 * figure caption, card number and parent label at 11px (10px for
 * the eyebrow in the mobile media query). Sub-12px sizes remain
 * legitimate only for aria-hidden decoration; none of these are.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (...parts: string[]) =>
  readFileSync(join(__dirname, ...parts), "utf8");

describe("tenant audit T10: no visible label under 12px", () => {
  test("renderer and Circle carry no text-[10px] or text-[11px]", () => {
    const renderer = read("..", "renderer.tsx");
    const circle = read("..", "..", "ui", "object-layer", "ObjectCircle.tsx");
    for (const source of [renderer, circle]) {
      expect(source).not.toContain("text-[10px]");
      expect(source).not.toContain("text-[11px]");
    }
  });

  test("edge sheet chips sit at the 0.75rem floor", () => {
    const edge = read("..", "..", "edge", "edge-sheet.css");
    expect(edge).not.toContain("0.68rem");
    expect(edge).toContain("font-size: 0.75rem");
  });

  test("visitor experience stylesheet has no 10px or 11px font sizes", () => {
    const ve = read("..", "visitor-experience.css");
    expect(ve).not.toContain("font-size:10px");
    expect(ve).not.toContain("font-size:11px");
  });
});
