/**
 * RENDER-WIRE: motion-css-text.ts must stay byte-identical to lane-7's
 * src/fyd/motion/motion.css. If this fails, regenerate motion-css-text.ts
 * from motion.css (never hand-edit either side to force a pass).
 */
import { readFileSync } from "fs";
import { join } from "path";
import { FYD_MOTION_CSS } from "../motion-css-text";

test("motion-css-text.ts is byte-identical to src/fyd/motion/motion.css", () => {
  const css = readFileSync(
    join(__dirname, "..", "..", "motion", "motion.css"),
    "utf8",
  );
  expect(FYD_MOTION_CSS).toBe(css);
});

test("motion css carries the .fyd-js gate and the reduced-motion floor", () => {
  expect(FYD_MOTION_CSS).toContain(".fyd-js [data-fyd-reveal]");
  expect(FYD_MOTION_CSS).toContain("prefers-reduced-motion: reduce");
  expect(FYD_MOTION_CSS).toContain(".fyd-before-after");
  expect(FYD_MOTION_CSS).toContain(".fyd-count-up");
});
