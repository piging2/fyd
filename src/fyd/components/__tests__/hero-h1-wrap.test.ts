/**
 * Hero H1 mobile wrap regression test.
 *
 * 2026-09-24 incident (FYD H1-clipping worker): the hero H1 renders an
 * arbitrary tenant business name. With `overflow-wrap: normal` (Tailwind
 * default), a single long unbreakable token (e.g. a 60+ character business
 * name with no spaces) overflows the H1 box and pushes
 * document.documentElement.scrollWidth past the viewport width at 375px,
 * producing a horizontally scrolling/clipped page on mobile.
 *
 * Browser proof (2026-09-24, 375px viewport, before fix): injecting
 * "SupercalifragilisticexpialidociousPlumbingAndHeatingServicesLLC" into the
 * hero H1 gave h1.scrollWidth=1001 against a 328px box and
 * document.scrollWidth=1018 against a 375px viewport. Screenshot:
 * evidence/before/synth-happy-place-375.png
 *
 * Generic fix: the hero H1 carries `break-words` (overflow-wrap: break-word)
 * so ANY tenant heading wraps inside its container. This test guards the
 * safeguard class on the hero H1 in the renderer source. It is
 * tenant-agnostic: no per-site code.
 *
 * NOTE: this repo's jest has no Babel/TS transform configured, so this file
 * uses plain CommonJS JavaScript only (require, no imports, no type
 * annotations), matching what the runner can actually execute.
 */
const fs = require("fs");
const path = require("path");

const RENDERER = path.join(
  __dirname,
  "..",
  "renderer.tsx"
);

function heroH1ClassName() {
  const src = fs.readFileSync(RENDERER, "utf8");
  // The Hero section's H1: the <h1> whose className holds text-4xl.
  const h1Idx = src.indexOf("<h1");
  expect(h1Idx).toBeGreaterThan(-1);
  const classMarker = 'className="';
  const classIdx = src.indexOf(classMarker, h1Idx);
  expect(classIdx).toBeGreaterThan(-1);
  const endIdx = src.indexOf('"', classIdx + classMarker.length);
  expect(endIdx).toBeGreaterThan(-1);
  return src.slice(classIdx + classMarker.length, endIdx);
}

describe("hero H1 mobile wrap safeguard", () => {
  test("hero H1 carries break-words so unbreakable tenant names cannot overflow", () => {
    const classes = heroH1ClassName().split(/\s+/);
    expect(classes).toContain("text-4xl");
    expect(classes).toContain("break-words");
  });

  test("exactly one hero H1 owns the safeguard (no duplicate H1s)", () => {
    const src = fs.readFileSync(RENDERER, "utf8");
    const matches = src.match(/<h1[\s>]/g) || [];
    expect(matches.length).toBe(1);
  });
});
