/**
 * Page-anchored presence (Nolan 2026-09-25 object-presence direction):
 * viewport-measured margin slots rebase onto the host's anchor region in
 * document coordinates, so resting circles scroll away with their region
 * instead of sitting viewport-fixed.
 */
import {
  anchorSlotsToRegion,
  resolveAnchorRegion,
  type AnchorRegion,
  type PeripheralSlot,
} from "../slot-manager";

function bandSlot(): PeripheralSlot {
  return {
    id: "band-right",
    rect: { x: 1600, y: 0, width: 320, height: 1080 },
    side: "right",
    capacity: 320 * 1080,
    stability: 1,
    collisionRisk: 0,
    kind: "band",
    collapsedD: 64,
  };
}

function peekSlot(): PeripheralSlot {
  return {
    id: "band-left",
    rect: { x: 0, y: 0, width: 40, height: 1080 },
    side: "left",
    capacity: 1,
    stability: 1,
    collisionRisk: 0,
    kind: "peek",
    collapsedD: 56,
  };
}

function noneSlot(): PeripheralSlot {
  return {
    id: "band-left",
    rect: { x: 0, y: 0, width: 10, height: 1080 },
    side: "left",
    capacity: 0,
    stability: 1,
    collisionRisk: 1,
    kind: "none",
    collapsedD: 56,
  };
}

const region: AnchorRegion = { top: 120, height: 760, source: "element" };

describe("anchorSlotsToRegion", () => {
  test("band slot: vertical span becomes the region, in document coordinates", () => {
    const [slot] = anchorSlotsToRegion([bandSlot()], region);
    expect(slot.rect.x).toBe(1600);
    expect(slot.rect.width).toBe(320);
    expect(slot.rect.y).toBe(120);
    expect(slot.rect.height).toBe(760);
    expect(slot.kind).toBe("band");
    expect(slot.capacity).toBeGreaterThan(0);
  });

  test("peek slot stays peek when the region is tall enough", () => {
    const [slot] = anchorSlotsToRegion([peekSlot()], region);
    expect(slot.kind).toBe("peek");
    expect(slot.rect.y).toBe(120);
    expect(slot.rect.height).toBe(760);
    expect(slot.collapsedD).toBe(56);
  });

  test("a slot that could host nothing stays unusable", () => {
    const [slot] = anchorSlotsToRegion([noneSlot()], region);
    expect(slot.kind).toBe("none");
    expect(slot.capacity).toBe(0);
  });

  test("document-anchored slots never move on scroll: stability is 1", () => {
    const [slot] = anchorSlotsToRegion([bandSlot()], region);
    expect(slot.stability).toBe(1);
  });

  test("deterministic: same inputs give same slots", () => {
    const a = anchorSlotsToRegion([bandSlot(), peekSlot()], region);
    const b = anchorSlotsToRegion([bandSlot(), peekSlot()], region);
    expect(a).toEqual(b);
  });

  test("does not mutate the input slots", () => {
    const input = bandSlot();
    anchorSlotsToRegion([input], region);
    expect(input.rect.y).toBe(0);
    expect(input.rect.height).toBe(1080);
  });
});

describe("resolveAnchorRegion", () => {
  test("server: returns null without a window", () => {
    // This suite runs in the node test environment: no DOM.
    expect(resolveAnchorRegion(null)).toBeNull();
  });
});
