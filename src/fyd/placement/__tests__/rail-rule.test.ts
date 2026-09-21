/**
 * Tests for the rail placement rule. Placement policy only: which margin
 * hosts the portal side rail given measured free whitespace.
 */
import { chooseRailSide, RAIL_TIE_BAND_PX } from "../rail-rule";

describe("chooseRailSide", () => {
  it("collapses to none when neither margin reaches minSafe", () => {
    expect(chooseRailSide(0, 0)).toBe("none");
    expect(chooseRailSide(87, 87)).toBe("none");
    expect(chooseRailSide(40, 10, 88)).toBe("none");
  });

  it("never invents a side from margins just under minSafe", () => {
    expect(chooseRailSide(87.9, 10)).toBe("none");
    expect(chooseRailSide(10, 87.9)).toBe("none");
  });

  it("accepts a margin exactly at minSafe", () => {
    expect(chooseRailSide(88, 0)).toBe("left");
    expect(chooseRailSide(0, 88)).toBe("right");
  });

  it("picks the only safe side", () => {
    expect(chooseRailSide(300, 40)).toBe("left");
    expect(chooseRailSide(40, 300)).toBe("right");
  });

  it("picks the greatest safe whitespace on clear winners", () => {
    expect(chooseRailSide(400, 100)).toBe("left");
    expect(chooseRailSide(100, 400)).toBe("right");
  });

  it("defaults to right on ties within the tie band", () => {
    expect(chooseRailSide(200, 200)).toBe("right");
    expect(chooseRailSide(200, 200 + RAIL_TIE_BAND_PX)).toBe("right");
    expect(chooseRailSide(200 + RAIL_TIE_BAND_PX, 200)).toBe("right");
  });

  it("breaks ties just outside the tie band by whitespace", () => {
    expect(chooseRailSide(200, 200 + RAIL_TIE_BAND_PX + 1)).toBe("right");
    expect(chooseRailSide(200 + RAIL_TIE_BAND_PX + 1, 200)).toBe("left");
  });

  it("clamps negative margins to zero", () => {
    expect(chooseRailSide(-50, -10)).toBe("none");
    expect(chooseRailSide(-50, 200)).toBe("right");
  });

  it("honors a custom minSafe", () => {
    expect(chooseRailSide(70, 70, 64)).toBe("right");
    expect(chooseRailSide(60, 60, 96)).toBe("none");
    expect(chooseRailSide(120, 60, 96)).toBe("left");
  });
});
