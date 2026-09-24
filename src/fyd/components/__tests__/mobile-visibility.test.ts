/**
 * Mobile regression tests.
 *
 * 2026-09-23 incident: objects disappeared on mobile.
 * Root causes fixed:
 * 1. Motion was a content availability dependency (opacity:0 base state).
 *    Fixed: base state is ALWAYS visible; motion enhances only.
 * 2. /sites pages lacked FydMotionFallback.
 *    Fixed: fallback mounted, handles stuck timelines.
 * 3. Private Pergola leaked into client payload.
 *    Fixed: publicGraph strips private objects (verified by build).
 * 4. No rich object overlay experience.
 *    Fixed: ObjectOverlay with scroll preservation.
 */
import * as fs from "fs";
import * as path from "path";

const REPO = "/home/nolan/projects/ping";

describe("motion is enhancement only (never a content dependency)", () => {
  test("base [data-motion='enter'] has no opacity:0", () => {
    const p = path.join(REPO, "src/fyd/components/renderer.tsx");
    const src = fs.readFileSync(p, "utf8");
    // The unconditional opacity:0 rule must be gone.
    // Nothing may hide via opacity, not even .fyd-io-pending (VQ-001):
    // full-page captures, print, crawlers, and no-scroll contexts never
    // drive the timeline or the observer, so opacity is never a gate.
    expect(src).not.toMatch(
      /"\.fyd-io \[data-motion='enter'\] \{ opacity: 0;/
    );
    expect(src).not.toMatch(
      /"\.fyd-io \[data-motion='enter'\]\.fyd-io-pending \{ opacity: 0;/
    );
    // The pending class still exists for the JS-controlled entrance,
    // but its entrance is transform-only.
    expect(src).toContain("fyd-io-pending");
    // VQ-001: the native scroll-timeline entrances must never zero opacity.
    for (const name of ["@keyframes fyd-enter", "@keyframes fyd-hero-settle"]) {
      const line = src.split("\n").find((l) => l.includes(name));
      expect(line).toBeDefined();
      expect(line).not.toContain("opacity");
    }
    // Print forces everything visible.
    expect(src).toContain("@media print");
  });

  test("SiteClient mounts FydMotionFallback", () => {
    const p = path.join(REPO, "src/app/sites/_shared/site-client.tsx");
    const src = fs.readFileSync(p, "utf8");
    expect(src).toContain("<FydMotionFallback />");
  });

  test("fallback only hides below-fold elements", () => {
    const p = path.join(REPO, "src/fyd/components/fyd-motion-fallback.tsx");
    const src = fs.readFileSync(p, "utf8");
    // Must check viewport before hiding.
    expect(src).toContain("getBoundingClientRect");
    expect(src).toContain("fyd-io-pending");
    // Must have safety net for false-positive native support.
    expect(src).toContain("fyd-force-visible");
  });
});

describe("object overlay experience", () => {
  test("ObjectOverlay component exists with required affordances", () => {
    const p = path.join(REPO, "src/fyd/components/object-overlay.tsx");
    const src = fs.readFileSync(p, "utf8");
    expect(src).toContain("Ask FYD");
    expect(src).toContain("Open full object");
    expect(src).toContain("provenance");
    // Scroll preservation
    expect(src).toContain("scrollY");
    expect(src).toContain("scrollTo");
  });

  test("SiteClient intercepts /o/ taps and opens overlay", () => {
    const p = path.join(REPO, "src/app/sites/_shared/site-client.tsx");
    const src = fs.readFileSync(p, "utf8");
    expect(src).toContain('a[href^="/o/"]');
    expect(src).toContain("setOverlayObjectId");
    expect(src).toContain("<ObjectOverlay");
  });

  test("overlay preserves scroll position on close", () => {
    const p = path.join(REPO, "src/fyd/components/object-overlay.tsx");
    const src = fs.readFileSync(p, "utf8");
    // Saves on mount, restores on unmount.
    expect(src).toMatch(/savedScroll\.current = window\.scrollY/);
    expect(src).toMatch(/window\.scrollTo\(0, savedScroll\.current\)/);
  });
});

describe("private payload boundary", () => {
  test("page uses publicGraph to strip private objects", () => {
    const p = path.join(REPO, "src/app/sites/happy-place/page.tsx");
    const src = fs.readFileSync(p, "utf8");
    expect(src).toContain("publicGraph(graph)");
    // The visibility filter lives in publicGraph (spec-pipeline.ts), not in
    // the page: assert the actual boundary, not an inline copy of it.
    const boundary = fs.readFileSync(
      path.join(REPO, "src/app/sites/_shared/spec-pipeline.ts"),
      "utf8",
    );
    expect(boundary).toMatch(/visibility === "public"/);
  });
});
