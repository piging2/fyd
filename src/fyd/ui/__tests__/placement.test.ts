/**
 * Unit tests for the deterministic margin-placement algorithm.
 * Run: npx jest --config src/fyd/ui/jest.config.cjs
 *
 * These assert the algorithm's contract: stable input -> stable output,
 * DOCUMENT-space clamping (never viewport clamping), scroll invariance
 * (placement is a pure function of document-space anchor Y), collision
 * resolution with minimum spacing, compact clustering, rail overflow
 * merging, and the never-overlap invariant.
 *
 * DOCUMENT-SPACE SEMANTICS (Nolan, 2026-09-22): AnchorInput.anchorMidY is
 * the document-space Y of the anchor midpoint (rect.top + scrollY +
 * rect.height/2, computed once at measure time). Placed.y is the
 * document-space slot center; the layer renders at position:absolute in a
 * document-height plane, so slots scroll WITH the page. There is no
 * viewportHeight and no scrollY anywhere in the contract.
 */

import {
  placeObjects,
  clusterIdFor,
  distributeBalanced,
  type AnchorInput,
  type PlacementOptions,
  type PlacementViewport,
} from "@/fyd/ui/object-layer/placement";

const viewport: PlacementViewport = {
  viewportWidth: 1440,
  documentHeight: 4000,
};

const baseOptions: PlacementOptions = {
  restDiameter: 64,
  minSpacing: 80,
  edgePadding: 12,
  clusterWindow: 72,
  rails: ["right"],
};

const LO = 12 + 32; // edgePadding + restDiameter/2
const HI = 4000 - 12 - 32; // documentHeight - edgePadding - restDiameter/2

function input(objectId: string, anchorMidY: number | null, priority = 0): AnchorInput {
  return { objectId, anchorMidY, priority };
}

describe("placeObjects", () => {
  test("stable input produces stable output", () => {
    const inputs = [input("a", 500), input("b", 510), input("c", 2000, 1)];
    const first = placeObjects(inputs, viewport, baseOptions);
    const second = placeObjects(inputs, viewport, baseOptions);
    expect(second).toEqual(first);
  });

  test("output is independent of input order", () => {
    const ordered = [input("a", 500), input("b", 900), input("c", 300)];
    const shuffled = [input("c", 300), input("a", 500), input("b", 900)];
    expect(placeObjects(shuffled, viewport, baseOptions)).toEqual(
      placeObjects(ordered, viewport, baseOptions),
    );
  });

  test("clamps anchors to the document bounds, never a viewport", () => {
    const placed = placeObjects(
      [input("top", -5000), input("bottom", 9000)],
      viewport,
      baseOptions,
    );
    expect(placed).toHaveLength(2);
    // Sorted by anchor: top first.
    expect(placed[0]).toMatchObject({ kind: "single", objectId: "top", y: LO });
    expect(placed[1]).toMatchObject({ kind: "single", objectId: "bottom", y: HI });
  });

  test("anchors beyond the old viewport are not clamped to it", () => {
    // Under the old viewport contract this would have clamped to 856
    // (viewportHeight 900 minus padding). Document space keeps it at 3500.
    const placed = placeObjects([input("a", 3500)], viewport, baseOptions);
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({ kind: "single", objectId: "a", y: 3500 });
  });

  test("resolves collisions by pushing down with minimum spacing", () => {
    const placed = placeObjects(
      [input("a", 500), input("b", 510)],
      viewport,
      { ...baseOptions, clusterWindow: 5 }, // no pre-clustering
    );
    expect(placed).toHaveLength(2);
    expect(placed[0]).toMatchObject({ kind: "single", objectId: "a", y: 500 });
    expect(placed[1]).toMatchObject({ kind: "single", objectId: "b", y: 580 });
  });

  test("merges nearby anchors into one stable cluster", () => {
    const placed = placeObjects(
      [input("b", 540), input("a", 500)],
      viewport,
      baseOptions, // 40px apart < clusterWindow 72
    );
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({
      kind: "cluster",
      clusterId: clusterIdFor(["a", "b"]),
      objectIds: ["a", "b"],
      rail: "right",
    });
    // Cluster id is order-stable.
    expect(clusterIdFor(["b", "a"])).toBe(clusterIdFor(["a", "b"]));
  });

  test("spills to the next rail when the preferred rail is exhausted", () => {
    // Document-space tiny page: documentHeight 200, so HI = 156.
    const tiny: PlacementViewport = { ...viewport, documentHeight: 200 };
    const tinyHI = 200 - 12 - 32; // 156
    const placed = placeObjects(
      [input("a", 0), input("b", 10), input("c", 20)],
      tiny,
      { ...baseOptions, clusterWindow: 5, rails: ["right", "left"] },
    );
    expect(placed).toHaveLength(3);
    expect(placed[0]).toMatchObject({ kind: "single", objectId: "a", rail: "right", y: 44 });
    expect(placed[1]).toMatchObject({ kind: "single", objectId: "b", rail: "right", y: 124 });
    // c: 44 -> 124 -> 204 > 156 on right; left rail has room at 44.
    expect(placed[2]).toMatchObject({ kind: "single", objectId: "c", rail: "left", y: 44 });
    expect(tinyHI).toBe(156);
  });

  test("merges into the nearest cluster when no rail has room", () => {
    const tiny: PlacementViewport = { ...viewport, documentHeight: 200 };
    const placed = placeObjects(
      [input("a", 0), input("b", 10), input("c", 20)],
      tiny,
      { ...baseOptions, clusterWindow: 5, rails: ["right"] },
    );
    // a at 44, b pushed to 124, c pushed past 156 -> merges into nearest (a).
    expect(placed).toHaveLength(2);
    const cluster = placed.find((p) => p.kind === "cluster");
    const single = placed.find((p) => p.kind === "single");
    expect(single).toMatchObject({ objectId: "b", y: 124 });
    expect(cluster).toMatchObject({
      clusterId: clusterIdFor(["a", "c"]),
      objectIds: ["a", "c"],
      rail: "right",
      y: 44,
    });
  });

  test("missing anchors sort last and clamp to the document bottom edge", () => {
    const placed = placeObjects(
      [input("ghost", null), input("real", 100)],
      viewport,
      baseOptions,
    );
    expect(placed).toHaveLength(2);
    expect(placed[0]).toMatchObject({ objectId: "real", y: 100 });
    expect(placed[1]).toMatchObject({ objectId: "ghost", y: HI });
  });

  test("never overlaps: pairwise spacing holds on a scattered set", () => {
    // Deterministic pseudo-random anchors (LCG, fixed seed).
    let s = 42;
    const rand = () => {
      s = (s * 1103515245 + 12345) % 2147483648;
      return s / 2147483648;
    };
    const inputs: AnchorInput[] = Array.from({ length: 12 }, (_, i) =>
      input(`obj-${i}`, Math.floor(rand() * 4000), i % 3),
    );
    const placed = placeObjects(inputs, viewport, {
      ...baseOptions,
      clusterWindow: 5,
      rails: ["right", "left"],
    });
    for (const p of placed) {
      expect(p.y).toBeGreaterThanOrEqual(LO);
      expect(p.y).toBeLessThanOrEqual(HI);
    }
    for (const rail of ["right", "left"] as const) {
      const ys = placed.filter((p) => p.rail === rail).map((p) => p.y);
      for (let i = 0; i < ys.length; i++) {
        for (let j = i + 1; j < ys.length; j++) {
          expect(Math.abs(ys[i] - ys[j])).toBeGreaterThanOrEqual(80);
        }
      }
    }
  });

  test("placement is scroll-invariant: anchor Y passes through unchanged", () => {
    // The old contract subtracted scrollY from the anchor (scrollY 400 on
    // anchor 500 yielded y 100). Document-space anchors are computed once
    // at measure time, so the algorithm takes them as-is: no scroll input,
    // no shift, identical output for any scroll position.
    const placed = placeObjects([input("a", 500)], viewport, baseOptions);
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({ kind: "single", objectId: "a", y: 500 });
  });

  test("empty rails place nothing", () => {
    expect(placeObjects([input("a", 500)], viewport, { ...baseOptions, rails: [] })).toEqual(
      [],
    );
  });
});

describe("distributeBalanced (dual-margin directive)", () => {
  const rails = ["right", "left"] as const;
  const docH = 4000;

  test("round-robins across both rails in placement priority order", () => {
    const inputs = [input("a", 500), input("b", 900), input("c", 300)];
    const parts = distributeBalanced(inputs, [...rails], docH);
    // placement order: c (300), a (500), b (900) -> right, left, right
    expect(parts.get("right")!.map((i) => i.objectId)).toEqual(["c", "b"]);
    expect(parts.get("left")!.map((i) => i.objectId)).toEqual(["a"]);
  });

  test("every input is assigned exactly once; no rail is starved", () => {
    const inputs = [
      input("s1", 100),
      input("s2", 200),
      input("s3", 300),
      input("s4", 400),
      input("s5", 500),
    ];
    const parts = distributeBalanced(inputs, [...rails], docH);
    const all = [...parts.get("right")!, ...parts.get("left")!].map((i) => i.objectId).sort();
    expect(all).toEqual(["s1", "s2", "s3", "s4", "s5"]);
    expect(parts.get("right")).toHaveLength(3);
    expect(parts.get("left")).toHaveLength(2);
  });

  test("priority wins the preferred rail", () => {
    const inputs = [input("low", 100, 0), input("high", 900, 1)];
    const parts = distributeBalanced(inputs, [...rails], docH);
    // priority 0 sorts before priority 1 regardless of anchor Y
    expect(parts.get("right")!.map((i) => i.objectId)).toEqual(["low"]);
    expect(parts.get("left")!.map((i) => i.objectId)).toEqual(["high"]);
  });

  test("stable input produces stable output; order-independent", () => {
    const a = [input("a", 500), input("b", 900), input("c", 300)];
    const b = [input("c", 300), input("a", 500), input("b", 900)];
    const pa = distributeBalanced(a, [...rails], docH);
    const pb = distributeBalanced(b, [...rails], docH);
    expect([...pb.entries()]).toEqual([...pa.entries()]);
  });

  test("per-rail placement keeps the never-overlap invariant", () => {
    // five objects sharing one anchor: spread like the layer does, then
    // place per rail. Neither rail may overlap the other, and each
    // rail's own slots keep minSpacing.
    const spread = [-280, -140, 0, 140, 280].map((dy, i) => input(`o${i}`, 2000 + dy));
    const parts = distributeBalanced(spread, [...rails], docH);
    const vp = { viewportWidth: 1280, documentHeight: docH };
    const opts = {
      restDiameter: 40,
      minSpacing: 56,
      edgePadding: 12,
      clusterWindow: 72,
    };
    const placed = [...rails].flatMap((r) =>
      placeObjects(parts.get(r)!, vp, { ...opts, rails: [r] }),
    );
    expect(placed).toHaveLength(5);
    const leftX = 12; // railOffsetForWidth(1280) = 12
    const rightX = 1280 - 12 - 40;
    for (const p of placed) {
      const x = p.rail === "right" ? rightX : leftX;
      // glyph rect stays inside the viewport and clear of center (center
      // column is [128, 1152] at 1280px: max-w-5xl centered)
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + 40).toBeLessThanOrEqual(1280);
      if (p.rail === "right") expect(x).toBeGreaterThanOrEqual(1152);
      else expect(x + 40).toBeLessThanOrEqual(128);
    }
  });
});
