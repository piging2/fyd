/**
 * Unit tests for the cluster constellation layout (star-layout.ts).
 *
 * The cluster slot renders its members as a staggered constellation of
 * mini-circles (3 per row, alternate rows offset by half a cell, every
 * row centered), never one big "+N" hero bubble. The module is pure:
 * stable member order produces stable geometry. These tests pin the
 * stagger math, the bounds, and the no-overlap guarantee.
 *
 * Run: npx jest --config src/fyd/ui/jest.config.cjs
 */

import {
  starLayoutFor,
  STAR_CELL,
  STAR_MINI_D,
  STAR_PER_ROW,
} from "../object-layer/star-layout";

describe("star-layout constants", () => {
  test("mini circles are 36px, 3 per row, 10px gutters", () => {
    expect(STAR_MINI_D).toBe(36);
    expect(STAR_PER_ROW).toBe(3);
    expect(STAR_CELL).toBe(46);
  });
});

describe("starLayoutFor", () => {
  test("zero members -> empty layout", () => {
    expect(starLayoutFor(0)).toEqual({ cells: [], width: 0, height: 0 });
  });

  test("one member -> one cell at the origin", () => {
    const l = starLayoutFor(1);
    expect(l.cells).toEqual([{ x: 0, y: 0 }]);
    expect(l.width).toBe(STAR_MINI_D);
    expect(l.height).toBe(STAR_MINI_D);
  });

  test("three members -> one full row", () => {
    const l = starLayoutFor(3);
    expect(l.cells).toEqual([
      { x: 0, y: 0 },
      { x: STAR_CELL, y: 0 },
      { x: 2 * STAR_CELL, y: 0 },
    ]);
    expect(l.width).toBe(3 * STAR_MINI_D + 2 * 10);
    expect(l.height).toBe(STAR_MINI_D);
  });

  test("four members -> second row staggered by half a cell and centered", () => {
    const l = starLayoutFor(4);
    expect(l.cells).toHaveLength(4);
    const row1 = l.cells.slice(0, 3);
    const row2 = l.cells.slice(3);
    // Row 1 sits on the first row; row 2 is one row down.
    for (const c of row1) expect(c.y).toBe(0);
    expect(row2[0].y).toBe(STAR_CELL);
    // Stagger: half a cell right of the row's centered origin.
    const row0Width = 3 * STAR_MINI_D + 2 * 10;
    const row1Width = STAR_MINI_D + STAR_CELL / 2;
    expect(l.width).toBe(row0Width);
    expect(row2[0].x).toBeCloseTo((row0Width - row1Width) / 2 + STAR_CELL / 2, 6);
  });

  test("six members -> two full rows, odd row staggered", () => {
    const l = starLayoutFor(6);
    expect(l.cells).toHaveLength(6);
    const row1 = l.cells.slice(3);
    // Odd row: half-cell stagger at the centered origin of the wider box.
    expect(row1.map((c) => c.x)).toEqual([23, 69, 115]);
    for (const c of row1) expect(c.y).toBe(STAR_CELL);
    // The staggered row is wider than a plain row.
    expect(l.width).toBe(3 * STAR_MINI_D + 2 * 10 + STAR_CELL / 2);
    expect(l.height).toBe(2 * STAR_MINI_D + 10);
  });

  test("deterministic: same count, same cells, every time", () => {
    for (const n of [1, 2, 5, 7, 12]) {
      expect(starLayoutFor(n)).toEqual(starLayoutFor(n));
    }
  });

  test("rows never hold more than STAR_PER_ROW members", () => {
    for (const n of [4, 5, 6, 7, 10]) {
      const l = starLayoutFor(n);
      const rows = new Map<number, number>();
      for (const c of l.cells) rows.set(c.y, (rows.get(c.y) ?? 0) + 1);
      for (const count of rows.values()) expect(count).toBeLessThanOrEqual(STAR_PER_ROW);
    }
  });

  test("1..12 members: cells stay inside the box and never overlap", () => {
    for (let n = 1; n <= 12; n++) {
      const l = starLayoutFor(n);
      expect(l.cells).toHaveLength(n);
      for (const c of l.cells) {
        expect(c.x).toBeGreaterThanOrEqual(0);
        expect(c.y).toBeGreaterThanOrEqual(0);
        expect(c.x + STAR_MINI_D).toBeLessThanOrEqual(l.width + 1e-9);
        expect(c.y + STAR_MINI_D).toBeLessThanOrEqual(l.height + 1e-9);
      }
      for (let i = 0; i < l.cells.length; i++) {
        for (let j = i + 1; j < l.cells.length; j++) {
          const a = l.cells[i];
          const b = l.cells[j];
          const separated =
            Math.abs(a.x - b.x) >= STAR_MINI_D - 1e-9 ||
            Math.abs(a.y - b.y) >= STAR_MINI_D - 1e-9;
          expect(separated).toBe(true);
        }
      }
    }
  });
});
