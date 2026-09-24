/**
 * Regression tests for expanded-card viewport clamping (Nolan, 2026-09-22:
 * at 1440px the expanded Ask card read as cut off at the right viewport
 * edge, with Back text and the Ask input partially clipped).
 *
 * - clampCardX (MarginObjectLayer.tsx): the full 300px card stays inside
 *   the viewport with CARD_EDGE_MARGIN breathing room, growing inward
 *   from the rail instead of pushing past the edge.
 * - AskObjectPanel compact: inside the ~300px oval the question form stays
 *   stacked (no viewport-driven sm:flex-row), so the input keeps full
 *   width. Portal surfaces keep the responsive row.
 *
 * Run: npx jest --config src/fyd/ui/jest.config.cjs
 */

import * as React from "react";
import { renderToString } from "react-dom/server";
import { CARD_EDGE_MARGIN, clampCardX } from "../object-layer/MarginObjectLayer";
import { AskObjectPanel } from "../ask-object-panel";

describe("clampCardX: expanded card stays inside the viewport", () => {
  test("right-rail slot at 1440px: card grows inward with edge margin", () => {
    // Right rail slot x: vw - RAIL_OFFSET - restD = 1440 - 24 - 40 = 1376.
    const x = clampCardX(1376, 300, 1440);
    expect(x).toBe(1440 - CARD_EDGE_MARGIN - 300);
    // Full card bounds inside the viewport with margin to spare.
    expect(x).toBeGreaterThanOrEqual(CARD_EDGE_MARGIN);
    expect(x + 300).toBeLessThanOrEqual(1440 - CARD_EDGE_MARGIN);
  });

  test("left-rail slot keeps the card inside the left edge", () => {
    const x = clampCardX(24, 300, 1440);
    expect(x).toBe(CARD_EDGE_MARGIN);
    expect(x + 300).toBeLessThanOrEqual(1440 - CARD_EDGE_MARGIN);
  });

  test("a slot already clear of the edge keeps its anchored position", () => {
    expect(clampCardX(800, 300, 1440)).toBe(800);
  });

  test("ask mode (300x460) clamps on the same width as the compact card", () => {
    // Height differs (460 vs 400); the horizontal clamp only sees width.
    expect(clampCardX(1376, 300, 1440)).toBe(1440 - CARD_EDGE_MARGIN - 300);
  });

  test("a card wider than the viewport degrades to margin alignment", () => {
    expect(clampCardX(100, 300, 320)).toBe(CARD_EDGE_MARGIN);
  });
});

describe("AskObjectPanel compact layout", () => {
  const props = {
    siteId: "test-site",
    objectName: "Happy Place Carpentry LLC",
    sampleQuestions: ["What kind of repairs work do you do?"],
  };

  test("compact stacks the form: no viewport-driven sm:flex-row", () => {
    const html = renderToString(<AskObjectPanel {...props} compact />);
    expect(html).not.toContain("sm:flex-row");
    expect(html).toContain("What do you want to know?");
  });

  test("portal default keeps the responsive row", () => {
    const html = renderToString(<AskObjectPanel {...props} />);
    expect(html).toContain("sm:flex-row");
  });
});
