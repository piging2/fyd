import { focusScrollDelta } from "../focus-and-reveal";

describe("spatial focused target visibility", () => {
  test("reveals the heading hidden above a short viewport's sticky header", () => {
    expect(focusScrollDelta({ top: -45, bottom: 30 }, 76, 400)).toBe(-129);
  });

  test("preserves scroll position when the target is already unobscured", () => {
    expect(focusScrollDelta({ top: 120, bottom: 164 }, 76, 400)).toBe(0);
  });

  test("reveals a target below the viewport by the minimum necessary distance", () => {
    expect(focusScrollDelta({ top: 380, bottom: 424 }, 76, 400)).toBe(32);
  });

  test("aligns a detail region taller than the available viewport at its beginning", () => {
    expect(focusScrollDelta({ top: 180, bottom: 900 }, 76, 400)).toBe(96);
  });

  test("uses the visual viewport offset when zoomed", () => {
    expect(focusScrollDelta({ top: 85, bottom: 130 }, 100, 300)).toBe(-23);
  });
});
