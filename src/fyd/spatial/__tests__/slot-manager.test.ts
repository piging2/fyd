import { largestFittingDiameter, MIN_SLOT_WIDTH } from "../slot-manager";

describe("largestFittingDiameter", () => {
  test("centered in rect", () => {
    // rect 300 wide, 900 tall; center (150, 450) -> diameter 300.
    expect(largestFittingDiameter({ x: 0, y: 0, width: 300, height: 900 }, 150, 450)).toBe(300);
  });

  test("off-center clamps to nearest edge", () => {
    // center 100px from left edge of a 300-wide rect -> diameter 200.
    expect(largestFittingDiameter({ x: 0, y: 0, width: 300, height: 900 }, 100, 450)).toBe(200);
  });

  test("center outside rect -> 0", () => {
    expect(largestFittingDiameter({ x: 0, y: 0, width: 300, height: 900 }, 400, 450)).toBe(0);
  });

  test("min slot width is a real threshold", () => {
    expect(MIN_SLOT_WIDTH).toBeGreaterThanOrEqual(64);
  });
});
