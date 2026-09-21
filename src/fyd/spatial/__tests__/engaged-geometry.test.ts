/**
 * engagedGeometryFor: the full portal footprint (circle + orbit controls)
 * must fit inside safe peripheral space. If it cannot, return null so the
 * caller stays collapsed instead of overlapping host content.
 */
import { engagedGeometryFor } from "../slot-manager";
import type { PeripheralSlot } from "../slot-manager";

function rightSlot(width: number): PeripheralSlot {
  return {
    id: "test-right",
    rect: { x: 1600, y: 0, width, height: 1080 },
    side: "right",
    capacity: width * 1080,
    stability: 1,
    collisionRisk: 0,
  };
}

describe("engagedGeometryFor", () => {
  test("right slot: circle shifts toward content, orbit fits the outer half", () => {
    const g = engagedGeometryFor({ width: 1920, height: 1080 }, rightSlot(320), { x: 1760, y: 400 });
    expect(g).not.toBeNull();
    // Full footprint: circle + one-sided orbit reserve stays in the slot.
    const footprintRight = g!.cx + g!.d / 2 + g!.orbitPad + g!.orbitBtn;
    const footprintLeft = g!.cx - g!.d / 2;
    expect(footprintLeft).toBeGreaterThanOrEqual(1600);
    expect(footprintRight).toBeLessThanOrEqual(1920);
    expect(g!.side).toBe("right");
    expect(g!.d).toBeGreaterThanOrEqual(200);
    expect(g!.d).toBeLessThanOrEqual(480);
  });

  test("narrow slot: no safe geometry, returns null instead of overlapping", () => {
    const g = engagedGeometryFor({ width: 1920, height: 1080 }, rightSlot(120), { x: 1860, y: 400 });
    expect(g).toBeNull();
  });

  test("dock mode: symmetric footprint fits inside the viewport", () => {
    const g = engagedGeometryFor({ width: 1920, height: 1080 }, null, { x: 960, y: 900 });
    expect(g).not.toBeNull();
    const fr = g!.d / 2 + g!.orbitPad + g!.orbitBtn + 8;
    expect(g!.cx - fr).toBeGreaterThanOrEqual(0);
    expect(g!.cx + fr).toBeLessThanOrEqual(1920);
    expect(g!.cy - fr).toBeGreaterThanOrEqual(0);
    expect(g!.cy + fr).toBeLessThanOrEqual(1080);
    expect(g!.side).toBe("dock");
  });

  test("mobile dock: compact orbit, footprint fits a 390px viewport", () => {
    const g = engagedGeometryFor({ width: 390, height: 844 }, null, { x: 195, y: 755 });
    expect(g).not.toBeNull();
    const fr = g!.d / 2 + g!.orbitPad + g!.orbitBtn + 8;
    expect(g!.cx - fr).toBeGreaterThanOrEqual(0);
    expect(g!.cx + fr).toBeLessThanOrEqual(390);
    expect(g!.cy + fr).toBeLessThanOrEqual(844);
    expect(g!.orbitBtn).toBe(38);
  });

  test("deterministic: same inputs give same geometry", () => {
    const a = engagedGeometryFor({ width: 1920, height: 1080 }, rightSlot(320), { x: 1760, y: 400 });
    const b = engagedGeometryFor({ width: 1920, height: 1080 }, rightSlot(320), { x: 1760, y: 400 });
    expect(a).toEqual(b);
  });
});
