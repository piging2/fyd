/**
 * REGRESSION (2026-10-08): /sites/kims-auto-parts returned 500.
 *
 * Root cause: the dynamic [siteId] route had no unknown-slug gate. Any
 * slug outside the bundle seam's serving authority fell through to
 * compilePublicSite, whose fail-closed throw ("Business information
 * unavailable.") surfaced as a 500. A slug the system cannot serve is a
 * client addressing error: the route must 404 via notFound().
 *
 * "kims-auto-parts" is a stale slug from the old fyd-build demo (which
 * had a static per-site page directory). It was never onboarded into the
 * converged architecture: no PING source objects exist for it, no
 * projection was ever dumped, and it is not pinned in the tenant
 * registry. Serving it would require the real business-onboarding
 * pipeline, not a fixture back-door.
 *
 * This suite pins the gate's decision function and asserts the route
 * source actually invokes the 404 gate (static source assertion, same
 * pattern as public-chrome-gate.test.ts).
 */
import * as fs from "fs";
import * as path from "path";
import { isServableSiteId } from "../_shared/site-lookup";
import { listSiteIds } from "@/fyd/media/site-bundle";

const REPO = "/home/nolan/projects/ping-fyd-converged";

describe("site-lookup gate: unknown slug -> 404, never 500", () => {
  test("pinned tenants are servable", () => {
    expect(isServableSiteId("happy-place")).toBe(true);
    expect(isServableSiteId("coppersmith-plumbing")).toBe(true);
    expect(isServableSiteId("ping-fyd")).toBe(true);
  });

  test("kims-auto-parts is not servable (stale old-demo slug: no PING projection, no tenant pin)", () => {
    expect(isServableSiteId("kims-auto-parts")).toBe(false);
  });

  test("disk-only projections are not servable (deliberate pin boundary)", () => {
    // These have PING projections on disk but were never pinned into the
    // bundle seam's closed-read authority, so the route cannot serve them.
    expect(isServableSiteId("clearwater-plumbing-demo")).toBe(false);
    expect(isServableSiteId("tenant-e2e-synth")).toBe(false);
  });

  test("arbitrary slugs are not servable", () => {
    expect(isServableSiteId("definitely-not-a-site")).toBe(false);
    expect(isServableSiteId("")).toBe(false);
  });

  test("gate agrees with the bundle seam's serving authority", () => {
    expect(listSiteIds().slice().sort()).toEqual(
      ["coppersmith-plumbing", "happy-place", "ping-fyd"].sort(),
    );
  });

  test("the dynamic route invokes the 404 gate (static source assertion)", () => {
    const src = fs.readFileSync(
      path.join(REPO, "src/app/sites/[siteId]/page.tsx"),
      "utf8",
    );
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(?<!:)\/\/[^\n]*/g, "");
    expect(code).toContain("notFound()");
    expect(code).toContain("isServableSiteId");
  });
});
