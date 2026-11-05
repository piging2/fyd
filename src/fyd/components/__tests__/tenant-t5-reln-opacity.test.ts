/**
 * tenant-t5-reln-opacity.test.ts — pins Website UI audit 2026-11-01
 * finding T5 for the relationship microcopy.
 *
 * The finding: .fyd-reln text rested at opacity .45 until hover
 * (ink #232033 at 45% over white is ~2.7:1, below AA), so the
 * relationship line was faded for every reader who never hovered
 * the exact card. CorrectionNote and the provenance line had already
 * been moved to the mutedForeground role on main; the reln line was
 * the residual.
 *
 * The fix: the motion styles rest .fyd-reln at opacity 1 in every
 * media block, and both render sites bind roles.mutedForeground
 * (derived to pass AA) instead of raw theme.ink under a fade.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("tenant audit T5: relationship microcopy never rests faded", () => {
  const source = readFileSync(
    join(__dirname, "..", "renderer.tsx"),
    "utf8",
  );

  test("no .fyd-reln rule sets opacity below 1", () => {
    const rules = source.match(/\.fyd-reln \{[^}]*\}/g) ?? [];
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule).not.toMatch(/opacity: \.45/);
      expect(rule).not.toMatch(/opacity: \.9/);
    }
    expect(source).not.toContain(".fyd-reln { opacity: .45");
  });

  test("both reln render sites bind the mutedForeground role", () => {
    const sites = source.match(/className="fyd-reln [^"]*" style=\{\{ color: ([^}]*)\}\}/g) ?? [];
    expect(sites).toHaveLength(2);
    for (const site of sites) {
      expect(site).toContain("roles.mutedForeground");
    }
  });
});
