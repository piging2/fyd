/**
 * Item 9 (fyd-execution) regression: hero fetchpriority is
 * measurement-gated (INV-RM-1).
 *
 * The directive is explicit: the primary hero gets fetchpriority="high"
 * ONLY when measurement supports it. heroFetchPriority(siteId) returns
 * "high" exactly when the pinned item-11 lab record names the hero as the
 * LCP element for that site; otherwise undefined (conservative default).
 * Until the browser leg runs, no site has a hero-LCP record, so this test
 * pins the conservative default for BOTH sites (INV-RG-1).
 */

import { heroFetchPriority } from "@/fyd/media/responsive";
import { PINNED_LAB } from "@/fyd/perf/lab-harness/pinned";

const SITES = ["coppersmith-plumbing", "happy-place"];

test.each(SITES)("hero priority for %s matches the pinned lab record", (site) => {
  const expected = PINNED_LAB.heroLcp[site] === "hero" ? "high" : undefined;
  expect(heroFetchPriority(site)).toBe(expected);
});

test.each(SITES)("no site claims an unmeasured hero LCP", (site) => {
  // Until the item-11 browser leg records an LCP element, the honest
  // answer is "unmeasured" and the render must not prioritize.
  if (PINNED_LAB.heroLcp[site] == null) {
    expect(heroFetchPriority(site)).toBeUndefined();
  }
});
