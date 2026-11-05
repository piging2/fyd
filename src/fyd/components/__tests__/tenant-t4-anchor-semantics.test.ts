/**
 * tenant-t4-anchor-semantics.test.ts — pins Website UI audit
 * 2026-11-01 finding T4.
 *
 * The finding: plain navigation anchors in the tenant renderer were
 * re-roled as buttons with a permanently false state
 * (<a role="button" tabIndex={0} aria-expanded="false">). The role
 * strips link semantics, the tabIndex is redundant on a natively
 * focusable anchor, and the aria-expanded never flips even though
 * clicks are intercepted into an overlay — so assistive technology
 * announces the wrong role and a permanently wrong state.
 *
 * The fix removed all three attributes from the five audited anchors
 * (card title, ObjectDoorway, Locations pill, feed title in
 * renderer.tsx; "View details" in object-affordance.tsx). Genuine
 * disclosures in this tree use real <button aria-expanded={state}>
 * elements; this pin keeps the fake pattern from returning: neither
 * file may contain a static aria-expanded="false" or an anchor
 * role="button" again.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const FILES = [
  "fyd/components/renderer.tsx",
  "fyd/components/object-affordance.tsx",
];

describe("tenant audit T4: navigation anchors keep link semantics", () => {
  for (const rel of FILES) {
    test(`${rel} carries no re-roled anchors or static aria-expanded`, () => {
      const srcRoot = join(__dirname, "..", "..", ".."); // src/
      const source = readFileSync(join(srcRoot, rel), "utf8");
      expect(source).not.toContain('aria-expanded="false"');
      expect(source).not.toContain('role="button"');
    });
  }
});
