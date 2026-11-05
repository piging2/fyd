/**
 * tenant-t7-chrome-theme.test.ts — pins Website UI audit 2026-11-01
 * finding T7 at its two halves.
 *
 * Public half (already satisfied on main): the public shell
 * (VisitorExperience) binds ONLY ctx.spec.themeTokens — its header,
 * nav and footer take no colour from the global palette; the
 * visitor-experience.css consumes only the --fyd-* role vars the
 * component emits. Pinned here at the source level so a future
 * chrome edit cannot silently reintroduce global-palette classes.
 *
 * Renderer half (fixed in this lane): the two sites the audit named —
 * the card description sitting under a theme-bound title, and the
 * SectionShell copy under a theme-bound heading — used the global
 * text-accent class while their titles bound theme.ink. Both now
 * bind roles.mutedForeground.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const renderer = readFileSync(
  join(__dirname, "..", "renderer.tsx"),
  "utf8",
);
const ve = readFileSync(
  join(__dirname, "..", "visitor-experience.tsx"),
  "utf8",
);

describe("tenant audit T7: one colour system per element", () => {
  test("card description and SectionShell copy bind the theme role, not the global class", () => {
    expect(renderer).not.toContain("fyd-card-desc mt-2 text-sm text-accent");
    expect(renderer).not.toContain("max-w-2xl text-base text-accent");
    expect(renderer).toContain(
      'className="fyd-card-desc mt-2 text-sm" style={{ color: roles.mutedForeground }}',
    );
    expect(renderer).toContain(
      'className="mt-2 max-w-2xl text-base" style={{ color: roles.mutedForeground }}',
    );
  });

  test("public shell binds only the spec theme tokens", () => {
    expect(ve).toContain("binds ONLY to ctx.spec.themeTokens");
    expect(ve).toContain("'--fyd-accent-text': roles.accentText");
    expect(ve).not.toContain("text-accent");
    expect(ve).not.toContain("bg-primary");
  });
});
