/**
 * Node-side unit tests for the motion lane's pure helpers.
 * Run: npx jest --config src/fyd/motion/jest.config.cjs
 */
import * as fs from "fs";
import * as path from "path";
import {
  revealDelayMs,
  REVEAL_STAGGER_MS,
  REVEAL_STAGGER_CAP,
  prefersReducedMotionNow,
  ensureMotionJs,
} from "../reveal";
import { clampPosition, splitFromPointer, SLIDER_KEY_STEP } from "../before-after";
import { easeOutCubic, countValueAt, formatCount } from "../count-up";

describe("revealDelayMs: stagger ladder with cap", () => {
  test("index 0 has no delay", () => {
    expect(revealDelayMs(0)).toBe(0);
  });
  test("each rung adds 80ms", () => {
    expect(revealDelayMs(1)).toBe(REVEAL_STAGGER_MS);
    expect(revealDelayMs(3)).toBe(3 * REVEAL_STAGGER_MS);
  });
  test("delay caps at index 6 (last item never waits past ~480ms)", () => {
    expect(revealDelayMs(REVEAL_STAGGER_CAP)).toBe(480);
    expect(revealDelayMs(7)).toBe(480);
    expect(revealDelayMs(100)).toBe(480);
  });
  test("negative and non-finite indexes are safe", () => {
    expect(revealDelayMs(-3)).toBe(0);
    expect(revealDelayMs(NaN)).toBe(0);
    expect(revealDelayMs(2.9)).toBe(revealDelayMs(2));
  });
});

describe("reveal environment guards", () => {
  test("prefersReducedMotionNow is false without a window", () => {
    expect(prefersReducedMotionNow()).toBe(false);
  });
  test("ensureMotionJs is a no-op without a document", () => {
    expect(() => ensureMotionJs()).not.toThrow();
  });
});

describe("before/after slider math", () => {
  test("clampPosition keeps the split in [0, 100]", () => {
    expect(clampPosition(50)).toBe(50);
    expect(clampPosition(-10)).toBe(0);
    expect(clampPosition(140)).toBe(100);
    expect(clampPosition(NaN)).toBe(50);
  });
  test("splitFromPointer maps clientX across the track", () => {
    expect(splitFromPointer(200, 100, 400)).toBe(25);
    expect(splitFromPointer(100, 100, 400)).toBe(0);
    expect(splitFromPointer(500, 100, 400)).toBe(100);
    expect(splitFromPointer(900, 100, 400)).toBe(100); // clamped
  });
  test("splitFromPointer is safe on degenerate rects", () => {
    expect(splitFromPointer(200, 100, 0)).toBe(50);
    expect(splitFromPointer(NaN, 100, 400)).toBe(50);
  });
  test("arrow-key step is the harvested +/-2", () => {
    expect(SLIDER_KEY_STEP).toBe(2);
  });
});

describe("count-up math", () => {
  test("easeOutCubic spans 0 to 1", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5); // ease-out: fast start
  });
  test("countValueAt interpolates with easing", () => {
    expect(countValueAt(0, 1000, 0)).toBe(0);
    expect(countValueAt(0, 1000, 1)).toBe(1000);
    expect(countValueAt(0, 1000, 0.5)).toBeGreaterThan(500);
  });
  test("formatCount groups thousands and honors decimals", () => {
    expect(formatCount(1250)).toBe("1,250");
    expect(formatCount(4.9, 1)).toBe("4.9");
    expect(formatCount(0)).toBe("0");
  });
});

describe("motion.css: choreography tokens", () => {
  const cssPath = path.join(__dirname, "..", "motion.css");
  const css = fs.readFileSync(cssPath, "utf8");

  test("reveal duration sits in the 400-600ms band", () => {
    const m = css.match(/--fyd-motion-duration:\s*(\d+)ms/);
    expect(m).not.toBeNull();
    const ms = Number(m![1]);
    expect(ms).toBeGreaterThanOrEqual(400);
    expect(ms).toBeLessThanOrEqual(600);
  });
  test("stagger step is 80ms with an index cap of 6", () => {
    expect(css).toMatch(/--fyd-motion-stagger:\s*80ms/);
    expect(css).toMatch(/--fyd-motion-stagger-cap:\s*6/);
  });
  test("clip reveal uses the harvested ease and ~750ms duration", () => {
    expect(css).toMatch(/--fyd-motion-clip-duration:\s*750ms/);
    expect(css).toMatch(/cubic-bezier\(0\.77,\s*0,\s*0\.175,\s*1\)/);
  });
  test("count-up duration is ~900ms", () => {
    expect(css).toMatch(/--fyd-motion-count-duration:\s*900ms/);
  });
  test("parallax bound is -10% / +10%", () => {
    expect(css).toMatch(/--fyd-motion-parallax-min:\s*-10%/);
    expect(css).toMatch(/--fyd-motion-parallax-max:\s*10%/);
  });
  test("hidden reveal states are gated behind .fyd-js (no-JS shows content)", () => {
    expect(css).toContain(".fyd-js [data-fyd-reveal]");
  });
  test("prefers-reduced-motion collapses every reveal to its final state", () => {
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toMatch(/transition:\s*none\s*!important/);
  });
  test("no infinite animations: rejected auto-rotation patterns are absent", () => {
    const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(cssNoComments).not.toMatch(/infinite/);
    expect(cssNoComments.toLowerCase()).not.toContain("preloader");
    expect(cssNoComments.toLowerCase()).not.toContain("carousel");
  });
  test("slider keeps a 44px minimum hit area and ew-resize cursor", () => {
    expect(css).toContain("44px");
    expect(css).toContain("ew-resize");
  });
  test("count-up uses tabular numerals", () => {
    expect(css).toContain("tabular-nums");
  });
});

/* ------------------------------------------------------------------ */
/* Interaction contracts, tested without a browser via injected globals */
/* ------------------------------------------------------------------ */

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: (entries: Array<{ isIntersecting: boolean; target: object }>) => void;
  targets = new Set<object>();
  disconnected = false;
  unobserved: object[] = [];
  constructor(
    callback: (entries: Array<{ isIntersecting: boolean; target: object }>) => void
  ) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }
  observe(t: object): void {
    this.targets.add(t);
  }
  unobserve(t: object): void {
    this.targets.delete(t);
    this.unobserved.push(t);
  }
  disconnect(): void {
    this.disconnected = true;
    this.targets.clear();
  }
  trigger(hit: boolean): void {
    this.callback(
      Array.from(this.targets).map((t) => ({ isIntersecting: hit, target: t }))
    );
  }
}

function withMockIO(fn: () => void): void {
  const g = globalThis as unknown as Record<string, unknown>;
  const prev = g["IntersectionObserver"];
  MockIntersectionObserver.instances = [];
  g["IntersectionObserver"] = MockIntersectionObserver;
  try {
    fn();
  } finally {
    if (prev === undefined) delete g["IntersectionObserver"];
    else g["IntersectionObserver"] = prev;
  }
}

function withMatchMedia(matches: boolean, fn: () => void): void {
  const g = globalThis as unknown as Record<string, unknown>;
  const prev = g["window"];
  g["window"] = {
    matchMedia: () => ({
      matches,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  };
  try {
    fn();
  } finally {
    if (prev === undefined) delete g["window"];
    else g["window"] = prev;
  }
}

describe("observeOnce: once semantics and observer cleanup", () => {
  // Imported lazily inside withMockIO so module-level evaluation order
  // cannot leak a real IntersectionObserver into the helper.
  test("fires on first intersection, then unobserves (never replays)", () => {
    withMockIO(() => {
      const { observeOnce } = require("../reveal") as typeof import("../reveal");
      const target = {};
      const seen: number[] = [];
      observeOnce(target as Element, () => seen.push(1));
      expect(MockIntersectionObserver.instances).toHaveLength(1);
      const io = MockIntersectionObserver.instances[0];
      io.trigger(false); // non-intersecting entries are ignored
      expect(seen).toHaveLength(0);
      io.trigger(true);
      expect(seen).toHaveLength(1);
      expect(io.unobserved).toEqual([target]);
      io.trigger(true); // replay is impossible: target was unobserved
      expect(seen).toHaveLength(1);
    });
  });

  test("cleanup disconnects the observer (unmount contract)", () => {
    withMockIO(() => {
      const { observeOnce } = require("../reveal") as typeof import("../reveal");
      const cleanup = observeOnce({} as Element, () => {});
      const io = MockIntersectionObserver.instances[0];
      expect(io.disconnected).toBe(false);
      cleanup();
      expect(io.disconnected).toBe(true);
    });
  });

  test("fires immediately when IntersectionObserver is unavailable", () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const prev = g["IntersectionObserver"];
    delete g["IntersectionObserver"];
    try {
      const { observeOnce } = require("../reveal") as typeof import("../reveal");
      let fired = false;
      const cleanup = observeOnce({} as Element, () => {
        fired = true;
      });
      expect(fired).toBe(true);
      expect(() => cleanup()).not.toThrow();
    } finally {
      if (prev !== undefined) g["IntersectionObserver"] = prev;
    }
  });
});

describe("revealNeedsObserver", () => {
  test("needs an observer by default", () => {
    withMockIO(() => {
      const { revealNeedsObserver } = require("../reveal") as typeof import("../reveal");
      expect(revealNeedsObserver(false)).toBe(true);
    });
  });
  test("reduced motion skips the observer: content appears immediately", () => {
    withMockIO(() => {
      const { revealNeedsObserver } = require("../reveal") as typeof import("../reveal");
      expect(revealNeedsObserver(true)).toBe(false);
    });
  });
  test("no observer available means immediate content", () => {
    const g = globalThis as unknown as Record<string, unknown>;
    const prev = g["IntersectionObserver"];
    delete g["IntersectionObserver"];
    try {
      const { revealNeedsObserver } = require("../reveal") as typeof import("../reveal");
      expect(revealNeedsObserver(false)).toBe(false);
    } finally {
      if (prev !== undefined) g["IntersectionObserver"] = prev;
    }
  });
});

describe("prefersReducedMotionNow with a mocked matchMedia", () => {
  test("reads the live OS setting", () => {
    withMatchMedia(true, () => {
      expect(prefersReducedMotionNow()).toBe(true);
    });
    withMatchMedia(false, () => {
      expect(prefersReducedMotionNow()).toBe(false);
    });
  });
});

describe("nextSliderPosition: keyboard interaction model", () => {
  // Lazy import for symmetry with the IO tests; the helper is pure.
  const mod = () => require("../before-after") as typeof import("../before-after");
  test("arrows step +-2 from the harvested contract", () => {
    const { nextSliderPosition } = mod();
    expect(nextSliderPosition(50, "ArrowRight")).toBe(52);
    expect(nextSliderPosition(50, "ArrowLeft")).toBe(48);
    expect(nextSliderPosition(50, "ArrowUp")).toBe(52);
    expect(nextSliderPosition(50, "ArrowDown")).toBe(48);
  });
  test("Home/End jump to the edges", () => {
    const { nextSliderPosition } = mod();
    expect(nextSliderPosition(50, "Home")).toBe(0);
    expect(nextSliderPosition(50, "End")).toBe(100);
  });
  test("PageUp/PageDown step +-10", () => {
    const { nextSliderPosition } = mod();
    expect(nextSliderPosition(50, "PageUp")).toBe(60);
    expect(nextSliderPosition(50, "PageDown")).toBe(40);
  });
  test("positions clamp at the edges", () => {
    const { nextSliderPosition } = mod();
    expect(nextSliderPosition(99, "ArrowRight")).toBe(100);
    expect(nextSliderPosition(1, "ArrowLeft")).toBe(0);
    expect(nextSliderPosition(0, "Home")).toBe(0);
  });
  test("unhandled keys return null (component skips preventDefault)", () => {
    const { nextSliderPosition } = mod();
    expect(nextSliderPosition(50, "Enter")).toBeNull();
    expect(nextSliderPosition(50, "Tab")).toBeNull();
    expect(nextSliderPosition(50, "a")).toBeNull();
  });
});

describe("resolveCountUpMode: verified-only honesty gate", () => {
  const mod = () => require("../count-up") as typeof import("../count-up");
  test("verified + full motion animates", () => {
    expect(mod().resolveCountUpMode({ verified: true, reducedMotion: false })).toBe("animate");
  });
  test("unverified numbers never animate, even with full motion", () => {
    expect(mod().resolveCountUpMode({ verified: false, reducedMotion: false })).toBe("static");
  });
  test("reduced motion renders the final value instantly", () => {
    expect(mod().resolveCountUpMode({ verified: true, reducedMotion: true })).toBe("static");
  });
  test("unverified + reduced motion is static", () => {
    expect(mod().resolveCountUpMode({ verified: false, reducedMotion: true })).toBe("static");
  });
});
