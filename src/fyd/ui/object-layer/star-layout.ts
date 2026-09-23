/**
 * Star-constellation layout for cluster slots in the margin object layer.
 * (Nolan, 2026-09-22: REST -> PEEK -> EXPAND -> ACT -> RECEIPT.)
 *
 * When anchors cluster, the slot does NOT render one big "+N" hero bubble.
 * It renders the members as a staggered constellation of mini-circles:
 * 3 per row, alternate rows offset by half a cell, each row centered, so
 * the pack reads star-like and scales to many members via wrapping rows.
 *
 * Pure module: no React, no DOM. Stable input produces stable output.
 * The ClusterSlot component positions the constellation in document space;
 * this module only computes the member cells relative to the
 * constellation box's top-left.
 */

export const STAR_MINI_D = 36;
export const STAR_PER_ROW = 3;
/** Cell pitch (mini diameter + gap): uniform 10px gutters. */
export const STAR_CELL = STAR_MINI_D + 10;

export interface StarCell {
  /** px from the constellation box's left edge. */
  x: number;
  /** px from the constellation box's top edge. */
  y: number;
}

export interface StarLayout {
  /** Member cells in member order. */
  cells: StarCell[];
  /** Constellation box width (px). */
  width: number;
  /** Constellation box height (px). */
  height: number;
}

/**
 * Staggered constellation for `count` members. Rows hold up to
 * STAR_PER_ROW minis; odd rows shift right by half a cell; every row is
 * centered in the box. Deterministic: member order alone decides geometry.
 */
export function starLayoutFor(count: number): StarLayout {
  if (count <= 0) return { cells: [], width: 0, height: 0 };
  const rows: number[] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / STAR_PER_ROW);
    rows[r] = (rows[r] ?? 0) + 1;
  }
  const stagger = STAR_CELL / 2;
  const rowWidth = (n: number, odd: boolean): number =>
    n * STAR_MINI_D + (n - 1) * (STAR_CELL - STAR_MINI_D) + (odd ? stagger : 0);
  const widths = rows.map((n, ri) => rowWidth(n, ri % 2 === 1));
  const width = Math.max(...widths);
  const height =
    rows.length * STAR_MINI_D + (rows.length - 1) * (STAR_CELL - STAR_MINI_D);
  const cells: StarCell[] = new Array(count);
  let idx = 0;
  rows.forEach((n, ri) => {
    const odd = ri % 2 === 1;
    const x0 = (width - widths[ri]) / 2 + (odd ? stagger : 0);
    for (let j = 0; j < n; j++) {
      cells[idx] = { x: x0 + j * STAR_CELL, y: ri * STAR_CELL };
      idx++;
    }
  });
  return { cells, width, height };
}
