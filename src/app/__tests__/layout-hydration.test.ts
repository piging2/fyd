/**
 * layout-hydration.test.ts — attributing test for the mobile hydration fix.
 *
 * The served demo on small screens hit React hydration-mismatch noise from
 * the root <html> element (theme/colorScheme attributes differ between the
 * server render and the client). The fix is a single attribute,
 * suppressHydrationWarning, on the <html> element in src/app/layout.tsx.
 *
 * This test pins that attribute: it FAILS if the attribute is removed from
 * the <html> opening tag and PASSES with it present. It is intentionally a
 * source-level pin (not a full RootLayout render, which needs Next.js
 * runtime context): the contract under test is "the root html tag carries
 * suppressHydrationWarning", nothing more.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LAYOUT_PATH = join(__dirname, "..", "layout.tsx");

function htmlOpenTag(source: string): string {
  const m = source.match(/<html[\s\S]*?>/);
  if (!m) throw new Error("no <html> opening tag found in src/app/layout.tsx");
  return m[0];
}

describe("root layout hydration fix", () => {
  it("marks the <html> element with suppressHydrationWarning", () => {
    const source = readFileSync(LAYOUT_PATH, "utf8");
    const tag = htmlOpenTag(source);
    expect(tag).toMatch(/suppressHydrationWarning/);
  });

  it("keeps the lang attribute on <html>", () => {
    const source = readFileSync(LAYOUT_PATH, "utf8");
    const tag = htmlOpenTag(source);
    expect(tag).toMatch(/lang="en"/);
  });
});
