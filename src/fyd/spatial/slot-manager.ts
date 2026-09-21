/**
 * SpatialSlotManager: answers WHERE something can live. Never what deserves to.
 *
 * Inputs: viewport, visualViewport, DOM geometry, primary content
 * rectangles, native fixed/sticky UI, interactive controls, PING semantic
 * anchors, scroll position, safe-area insets, existing PING occupancy.
 * Output: SAFE PERIPHERAL RECTANGLES.
 *
 * V1 is deterministic page geometry only: viewport bounds, content column
 * bounds, known occupied elements, fixed/sticky regions -> left/right
 * peripheral bands. No computer-vision pixel hunting in V1.
 *
 * Observers: ResizeObserver + RAF-throttled scroll + selective
 * MutationObserver + cached geometry. Recompute only on invalidation.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SlotSide = "left" | "right" | "top" | "bottom";

export interface PeripheralSlot {
  id: string;
  /** Viewport coordinates. */
  rect: Rect;
  side: SlotSide;
  /** Usable area in px^2; 0 means the slot cannot host anything. */
  capacity: number;
  /** 0..1; margin bands are 1 (they never move on scroll). */
  stability: number;
  /** 0..1 after fixed-chrome subtraction; 0 is clean. */
  collisionRisk: number;
}

/** Minimum band width that can host a collapsed circle. */
export const MIN_SLOT_WIDTH = 88;

function unionRects(rects: Rect[]): Rect | null {
  const valid = rects.filter((r) => r.width > 0 && r.height > 0);
  if (valid.length === 0) return null;
  const x = Math.min(...valid.map((r) => r.x));
  const y = Math.min(...valid.map((r) => r.y));
  const right = Math.max(...valid.map((r) => r.x + r.width));
  const bottom = Math.max(...valid.map((r) => r.y + r.height));
  return { x, y, width: right - x, height: bottom - y };
}

function elRect(el: Element): Rect | null {
  if (typeof window === "undefined") return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

/** True when the element belongs to PING's own chrome (never measured as host geometry). */
function isPingChrome(el: Element): boolean {
  return (
    el.hasAttribute("data-ping-host") ||
    el.hasAttribute("data-ping-slot") ||
    el.closest("[data-ping-host]") !== null
  );
}

/**
 * Visual content column: the horizontal span the host actually fills with
 * content. Full-bleed sections (backgrounds painted edge to edge) do not
 * count: what matters is the centered, width-constrained containers the
 * host centers its content in. Union over qualifying containers so one
 * narrow paragraph cannot shrink the column.
 *
 * Falls back to landmark union, then to a conservative centered gutter.
 */
function contentColumn(): { left: number; right: number } {
  const vw = window.innerWidth;
  if (typeof document === "undefined") return { left: 0, right: vw };
  const scope = document.querySelector("main") ?? document.body;
  let left = Infinity;
  let right = -Infinity;
  let hits = 0;
  const els = Array.from(scope.querySelectorAll("div, section, article")).slice(0, 500);
  for (const el of els) {
    if (isPingChrome(el)) continue;
    const html = el as HTMLElement;
    if (html.offsetParent === null && html !== document.body) continue;
    const r = html.getBoundingClientRect();
    if (r.height < 40) continue;
    // Constrained but substantial: between 30% and 96% of viewport.
    if (r.width < vw * 0.3 || r.width > vw * 0.96) continue;
    // Roughly centered.
    const centerX = r.x + r.width / 2;
    if (Math.abs(centerX - vw / 2) > vw * 0.06) continue;
    // A container: its parent is meaningfully wider (it constrains width).
    const parent = html.parentElement;
    if (!parent || isPingChrome(parent)) continue;
    const pr = parent.getBoundingClientRect();
    if (pr.width < r.width + 40) continue;
    // Fixed/sticky elements are chrome, not content.
    let pos = "";
    try {
      pos = window.getComputedStyle(html).position;
    } catch {
      continue;
    }
    if (pos === "fixed" || pos === "sticky") continue;
    hits++;
    if (r.x < left) left = r.x;
    if (r.x + r.width > right) right = r.x + r.width;
  }
  if (hits >= 2 && left < right) {
    return { left: Math.max(0, left), right: Math.min(vw, right) };
  }
  // Fallback: explicit semantic landmarks.
  const anchors = Array.from(document.querySelectorAll("main, [role='main'], article"));
  const union = unionRects(
    anchors
      .filter((a) => !isPingChrome(a))
      .map(elRect)
      .filter((r): r is Rect => r !== null),
  );
  if (union) return { left: Math.max(0, union.x), right: Math.min(vw, union.x + union.width) };
  // Last resort: conservative centered gutter.
  const gutter = Math.max(0, (vw - 1024) / 2);
  return { left: gutter, right: vw - gutter };
}

/**
 * Native fixed/sticky chrome: bounded scan of top-level landmarks only.
 * This is deliberate: a full-tree computed-style walk on every mutation
 * would be the MutationObserver firehose this module refuses to build.
 * PING's own chrome is excluded (it must never subtract from itself).
 */
function fixedChromeRects(): Rect[] {
  if (typeof document === "undefined" || typeof window === "undefined") return [];
  const out: Rect[] = [];
  const candidates = Array.from(
    document.querySelectorAll("header, nav, [role='banner'], [role='navigation'], [data-ping-chrome]"),
  );
  const bodyChildren = Array.from(document.body ? document.body.children : []);
  for (const el of [...candidates, ...bodyChildren]) {
    if (isPingChrome(el)) continue;
    let pos = "";
    try {
      pos = window.getComputedStyle(el).position;
    } catch {
      continue;
    }
    if (pos !== "fixed" && pos !== "sticky") continue;
    const r = elRect(el);
    if (r) out.push(r);
  }
  return out;
}

function subtractBars(band: Rect, bars: Rect[]): Rect {
  let { y, height } = band;
  for (const bar of bars) {
    const barTop = bar.y;
    const barBottom = bar.y + bar.height;
    // Only horizontal bars (full-width-ish) shrink the band vertically.
    if (bar.width < band.width * 2) continue;
    if (barTop <= y + 1 && barBottom > y) {
      const cut = barBottom - y;
      y += cut;
      height -= cut;
    } else if (barBottom >= y + height - 1 && barTop < y + height) {
      height = barTop - y;
    }
  }
  return { x: band.x, y, width: band.width, height: Math.max(0, height) };
}

/**
 * Compute safe peripheral rectangles for the current viewport.
 * Pure DOM read; call from RAF-throttled observers, never in a loop
 * interleaved with writes.
 */
export function computeSlots(): PeripheralSlot[] {
  if (typeof window === "undefined" || typeof document === "undefined") return [];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const { left, right } = contentColumn();
  const bars = fixedChromeRects();

  const bands: Array<{ id: string; side: SlotSide; rect: Rect }> = [
    { id: "band-left", side: "left", rect: { x: 0, y: 0, width: Math.max(0, left), height: vh } },
    {
      id: "band-right",
      side: "right",
      rect: { x: right, y: 0, width: Math.max(0, vw - right), height: vh },
    },
  ];

  return bands.map((b) => {
    const rect = subtractBars(b.rect, bars);
    const usable = rect.width >= MIN_SLOT_WIDTH && rect.height >= MIN_SLOT_WIDTH;
    return {
      id: b.id,
      rect,
      side: b.side,
      capacity: usable ? rect.width * rect.height : 0,
      stability: 1,
      collisionRisk: usable ? 0 : 1,
    };
  });
}

/**
 * Largest circle diameter that fits entirely inside rect when centered at
 * (cx, cy). SIZE = FUNCTION OF AVAILABLE SAFE RECTANGLE.
 */
export function largestFittingDiameter(rect: Rect, cx: number, cy: number): number {
  const d = 2 * Math.min(cx - rect.x, rect.x + rect.width - cx, cy - rect.y, rect.y + rect.height - cy);
  return Math.max(0, Math.floor(d));
}

/** Engaged-state size bounds for the portal circle itself. */
export const ENGAGED_MIN = 200;
export const ENGAGED_MAX = 480;
/** Orbit control footprint beyond the circle edge (desktop). */
export const ORBIT_PAD = 26;
export const ORBIT_BTN = 44;
/** Compact orbit for narrow viewports. */
export const ORBIT_PAD_COMPACT = 16;
export const ORBIT_BTN_COMPACT = 38;

export type EngagedSide = "left" | "right" | "dock";

export interface EngagedGeometry {
  /** Circle diameter in px. */
  d: number;
  /** Circle center in viewport coordinates. */
  cx: number;
  cy: number;
  side: EngagedSide;
  orbitPad: number;
  orbitBtn: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(v, hi));
}

/**
 * Full-footprint engaged geometry for a portal circle.
 *
 * The engaged portal is not just the circle: its orbit controls extend
 * beyond the circle edge, and the WHOLE footprint must fit inside safe
 * peripheral space. For side slots the orbit is one-sided (controls live
 * on the outer half, away from host content), so the circle shifts toward
 * the content boundary to make room. For dock mode (no safe slot) the
 * orbit is symmetric and the footprint must fit inside the viewport.
 *
 * Returns null when no safe geometry exists: the caller must stay
 * collapsed rather than overlap host content.
 */
export function engagedGeometryFor(
  viewport: { width: number; height: number },
  slot: PeripheralSlot | null,
  anchor: { x: number; y: number },
): EngagedGeometry | null {
  const compact = viewport.width < 640;
  const orbitPad = compact ? ORBIT_PAD_COMPACT : ORBIT_PAD;
  const orbitBtn = compact ? ORBIT_BTN_COMPACT : ORBIT_BTN;
  const vw = viewport.width;
  const vh = viewport.height;

  if (slot && (slot.side === "left" || slot.side === "right")) {
    // One-sided orbit: reserve orbit space on the outer half only.
    const reserve = orbitPad + orbitBtn + 16; // orbit + placement margins
    let d = Math.floor(slot.rect.width - reserve);
    if (d < ENGAGED_MIN) return null;
    d = Math.min(d, ENGAGED_MAX);
    const r = d / 2;
    const cx =
      slot.side === "right"
        ? slot.rect.x + 8 + r
        : slot.rect.x + slot.rect.width - 8 - r;
    // Vertical: keep the circle (top/bottom orbit buttons stay within the
    // viewport's vertical span; horizontal is the binding constraint).
    const top = r + 8;
    const bottom = vh - r - 8;
    if (top > bottom) return null;
    const cy = clamp(anchor.y, top, bottom);
    return { d, cx, cy, side: slot.side, orbitPad, orbitBtn };
  }

  // Dock mode: symmetric orbit, footprint must fit the viewport.
  let d = compact ? Math.min(240, vw * 0.62) : Math.min(340, vw * 0.84);
  d = Math.floor(d);
  if (d < ENGAGED_MIN) return null;
  d = Math.min(d, ENGAGED_MAX);
  const fr = d / 2 + orbitPad + orbitBtn + 8; // full footprint radius
  if (fr * 2 > vw || fr * 2 > vh) return null;
  const cx = clamp(anchor.x, fr, vw - fr);
  const cy = clamp(anchor.y, fr, vh - fr);
  return { d, cx, cy, side: "dock", orbitPad, orbitBtn };
}

export interface SlotManager {
  update: () => void;
  dispose: () => void;
}

/**
 * Observe geometry invalidation and recompute slots. ResizeObserver +
 * passive RAF-throttled scroll + selective MutationObserver (childList on
 * body, debounced). No firehose: mutations debounce to 250ms.
 */
export function createSlotManager(onSlots: (slots: PeripheralSlot[]) => void): SlotManager {
  let raf = 0;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const emit = () => {
    if (disposed) return;
    onSlots(computeSlots());
  };
  const schedule = () => {
    if (raf) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      emit();
    });
  };

  const onScroll = () => schedule();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);

  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(schedule);
    ro.observe(document.documentElement);
  }

  let mo: MutationObserver | null = null;
  if (typeof MutationObserver !== "undefined" && document.body) {
    mo = new MutationObserver(() => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(schedule, 250);
    });
    mo.observe(document.body, { childList: true, subtree: false });
  }

  // Initial emit on next frame so layout has settled.
  schedule();

  return {
    update: schedule,
    dispose: () => {
      disposed = true;
      if (raf) window.cancelAnimationFrame(raf);
      if (debounce) clearTimeout(debounce);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      ro?.disconnect();
      mo?.disconnect();
    },
  };
}
