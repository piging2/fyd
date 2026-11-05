/**
 * tenant-t2-tap-targets.test.ts — pins Website UI audit 2026-11-01
 * finding T2 (HIGH).
 *
 * The margin Circle's rest diameter was 40px and its cluster
 * ("star") minis 36px, under the 44px touch floor. Sizes changed at
 * the constants (REST_D 48 for the free-standing circle, EDGE_REST_D
 * 44 for the space-tight edge rails, STAR_MINI_D 44 with STAR_CELL
 * deriving at D + 10 so gutters hold), and the peek actions' 40px
 * minimums rose to 44px. Layout fit-gating derives from these
 * constants, and the rendered sizes are verified in the browser
 * (before/after captures in the lane records).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REST_D } from "../../ui/object-layer/ObjectCircle";
import {
  STAR_CELL,
  STAR_MINI_D,
  starLayoutFor,
} from "../../ui/object-layer/star-layout";

const layer = (...parts: string[]) =>
  readFileSync(join(__dirname, "..", "..", "ui", "object-layer", ...parts), "utf8");

describe("tenant audit T2: Circle tap targets meet the 44px floor", () => {
  test("rest diameters are at or above the floor", () => {
    expect(REST_D).toBe(48);
    expect(STAR_MINI_D).toBe(44);
    const mol = layer("MarginObjectLayer.tsx");
    expect(mol).toContain("const EDGE_REST_D = 44;");
  });

  test("star geometry derives from the constant with gutters preserved", () => {
    expect(STAR_CELL).toBe(STAR_MINI_D + 10);
    const layout = starLayoutFor(3);
    expect(layout.width).toBe(3 * STAR_MINI_D + 2 * 10);
    expect(layout.height).toBe(STAR_MINI_D);
    // No two minis overlap at the new diameter.
    const cells = starLayoutFor(7).cells;
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const dx = cells[i].x - cells[j].x;
        const dy = cells[i].y - cells[j].y;
        expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(STAR_MINI_D);
      }
    }
  });

  test("no 40px minimums remain on Circle controls", () => {
    const oc = layer("ObjectCircle.tsx");
    expect(oc).not.toContain("min-h-[40px]");
    expect(oc).toContain("min-h-[44px]");
  });
});
