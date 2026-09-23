/**
 * Royal Mirror shape-system tests (Nolan, 2026-09-22): the frozen
 * CIRCLES + OVALS token system is enforced at the token layer and in markup.
 *
 * - The ten required tokens exist as usable scalar values:
 *   fyd.color.royal, fyd.color.gold, fyd.surface.mirror, fyd.surface.depth,
 *   fyd.border.gold, fyd.radius.circle, fyd.radius.oval, fyd.shadow.mirror,
 *   fyd.motion.expand, fyd.motion.collapse.
 * - Shape facts: circle radius is 50%, oval radius is 999px, REST_D is 40.
 * - fydMirrorCard is a non-empty reflective surface string.
 * - Decorative motion (sheen, breathing) is motion-safe by construction:
 *   resolveCircleMotion collapses it under prefers-reduced-motion, so no
 *   functionality depends on animation.
 *
 * Run: npx jest --config src/fyd/ui/jest.config.cjs
 *
 * 2026-09-22 18:40 redesign (BINDING, supersedes the earlier oval card
 * targets): GLYPH -> PEEK -> WORKSPACE. Geometry follows function; the
 * oval expansion geometry is dead. The surface contract under test:
 * - STATE 1 is the small quiet 40px glyph (REST_D).
 * - STATE 2 PEEK is a compact anchored preview: max width inside the
 *   360-420px directive band, 340px placement budget, never scrolls.
 * - STATE 3 WORKSPACE is a restrained sheet inside the 360-420px band
 *   (desktop) or a bottom sheet (mobile).
 */

import {
  CIRCLE_MOTION,
  PEEK_H,
  PEEK_W,
  REST_D,
  WORKSPACE_W,
  resolveCircleMotion,
} from "../object-layer/ObjectCircle";
import { fyd, fydMirrorCard } from "../object-layer/fyd-tokens";

describe("required token contract", () => {
  const scalar: Array<[string, unknown]> = [
    ["fyd.color.royal", fyd.color.royal],
    ["fyd.color.gold", fyd.color.gold],
    ["fyd.surface.mirror", fyd.surface.mirror],
    ["fyd.surface.depth", fyd.surface.depth],
    ["fyd.border.gold", fyd.border.gold],
    ["fyd.radius.circle", fyd.radius.circle],
    ["fyd.radius.oval", fyd.radius.oval],
    ["fyd.shadow.mirror", fyd.shadow.mirror],
  ];
  test.each(scalar)("%s exists as a usable scalar value", (_name, value) => {
    expect(typeof value).toBe("string");
    expect((value as string).length).toBeGreaterThan(0);
  });

  // Motion tokens are framer-motion transition configs: the usable value
  // is the object itself, consumed as transition={fyd.motion.expand}.
  test.each([
    ["fyd.motion.expand", fyd.motion.expand],
    ["fyd.motion.collapse", fyd.motion.collapse],
  ])("%s exists as a transition config", (_name, value) => {
    expect(typeof value).toBe("object");
    expect((value as { duration: number }).duration).toBeGreaterThan(0);
  });

  test("fydMirrorCard is a non-empty reflective surface", () => {
    expect(typeof fydMirrorCard).toBe("string");
    expect(fydMirrorCard.length).toBeGreaterThan(0);
  });
});

describe("frozen shape facts", () => {
  test("circle radius is 50%, oval radius is 999px", () => {
    expect(fyd.radius.circle).toBe("50%");
    expect(fyd.radius.oval).toBe("999px");
  });

  test("rest circle stays the small quiet 40px", () => {
    expect(REST_D).toBe(40);
  });

  test("STATE 2 peek is a compact anchored preview inside the 360-420px directive band", () => {
    expect(PEEK_W).toBeGreaterThanOrEqual(360);
    expect(PEEK_W).toBeLessThanOrEqual(420);
    expect(PEEK_H).toBe(340);
  });

  test("STATE 3 workspace is a restrained sheet inside the 360-420px directive band", () => {
    expect(WORKSPACE_W).toBeGreaterThanOrEqual(360);
    expect(WORKSPACE_W).toBeLessThanOrEqual(420);
  });

  test("gold is an edge/detail value, never a whole surface", () => {
    // The token layer exposes no solid-gold surface: gold appears only as
    // a color and a border, never as a background fill token.
    expect(fyd.surface.mirror).not.toContain(fyd.color.gold);
    expect(fydMirrorCard).not.toContain(fyd.color.gold);
  });
});

describe("reduced motion", () => {
  test("decorative motion is disabled when reduced motion is requested", () => {
    const m = resolveCircleMotion(CIRCLE_MOTION, true);
    expect(m.decorative).toBe(false);
    expect(m.appearDuration).toBeLessThanOrEqual(0.01);
  });

  test("decorative motion runs when motion is allowed", () => {
    const m = resolveCircleMotion(CIRCLE_MOTION, false);
    expect(m.decorative).toBe(true);
    expect(m.appearDuration).toBeGreaterThan(0.01);
  });
});
