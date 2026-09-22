/**
 * Motion 3.0 registry conformance tests.
 *
 * Verifies: determinism (same spec -> same resolution), reduced-motion
 * always wins, transform+opacity only (no filter/blur in vetted paths),
 * ambient edge gating, CSS-first for trivial motion, closed world
 * (unmapped specs resolve to no motion, never invented motion).
 */
import { resolveMotion, VETTING_LEDGER } from "../registry";
import type { MotionSpec } from "../registry";

describe("motion registry", () => {
  test("is deterministic: same spec -> deep-equal resolution", () => {
    const spec: MotionSpec = {
      role: "reveal", placement: "content", intensity: "standard",
      trigger: "scroll", reducedMotion: false,
    };
    expect(resolveMotion(spec)).toEqual(resolveMotion(spec));
  });

  test("reduced motion always wins, regardless of other axes", () => {
    const specs: MotionSpec[] = [
      { role: "reveal", placement: "content", intensity: "strong", trigger: "scroll", reducedMotion: true },
      { role: "ambient", placement: "edge", intensity: "strong", trigger: "none", reducedMotion: true },
      { role: "feedback", placement: "content", intensity: "standard", trigger: "hover", reducedMotion: true },
      { role: "transition", placement: "overlay", intensity: "standard", trigger: "mount", reducedMotion: true },
    ];
    for (const s of specs) {
      const r = resolveMotion(s);
      expect(r.kind).toBe("none");
      expect(r.reason).toMatch(/reduced-motion/);
    }
  });

  test("scroll reveal resolves to harvested framer variants", () => {
    const r = resolveMotion({
      role: "reveal", placement: "content", intensity: "standard",
      trigger: "scroll", reducedMotion: false,
    });
    expect(r.kind).toBe("framer");
    expect(r.variants).toBeDefined();
    // vetted variants carry a reducedMotion state and never use filter
    const v = JSON.stringify(r.variants);
    expect(v).toContain("reducedMotion");
    expect(v).not.toMatch(/blur|filter/);
  });

  test("trivial feedback is CSS-first, transform/opacity only", () => {
    const r = resolveMotion({
      role: "feedback", placement: "content", intensity: "subtle",
      trigger: "hover", reducedMotion: false,
    });
    expect(r.kind).toBe("css");
    expect(r.cssClasses).toBeDefined();
    // no layout-property transitions
    expect(r.cssClasses).not.toMatch(/transition-all/);
    expect(r.cssClasses).toMatch(/transition-transform/);
  });

  test("ambient edge requires pointer-events-none and desktop-only", () => {
    const r = resolveMotion({
      role: "ambient", placement: "edge", intensity: "subtle",
      trigger: "none", reducedMotion: false,
    });
    expect(r.kind).toBe("css");
    expect(r.cssClasses).toContain("pointer-events-none");
    expect(r.cssClasses).toContain("hidden md:block");
    expect(r.requirements.join(" ")).toMatch(/768px/);
  });

  test("closed world: unmapped spec -> no motion, never invented", () => {
    const r = resolveMotion({
      role: "ambient", placement: "content", intensity: "strong",
      trigger: "scroll", reducedMotion: false,
    });
    expect(r.kind).toBe("none");
    expect(r.reason).toMatch(/no vetted implementation/);
  });

  test("vetting ledger documents every exclusion with a reason", () => {
    expect(VETTING_LEDGER.excluded.length).toBeGreaterThan(0);
    for (const e of VETTING_LEDGER.excluded) {
      expect(e.why.length).toBeGreaterThan(10);
    }
    // blur is explicitly excluded (transform+opacity only)
    expect(VETTING_LEDGER.excluded.map(e => e.impl).join(" ")).toMatch(/revealBlur/);
  });
});
