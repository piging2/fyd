import type { ObjectPlacementMode } from "../sitespec/types";
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
 *
 * Presence law (Nolan 2026-09-25 object-presence direction, standing
 * product law): resting presence is PAGE-ANCHORED, never viewport-fixed.
 * Edge-presence consumers rebase these viewport-measured slots onto an
 * anchor region (see AnchorRegion / anchorSlotsToRegion) and render at
 * document coordinates, so objects scroll away with their region.
 * True viewport-fixed is reserved for the "persistent" presence mode
 * (earned utility only), never for decorative discovery objects.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SlotSide = "left" | "right" | "top" | "bottom";

export type SlotKind = "band" | "peek" | "none";


/**
 * PresentationPresetMode: runtime alias for SiteSpec's ObjectPlacementMode
 * (single authority for "embedded" | "edge" | "persistent").
 *
 * Resting presence and open interaction are separate problems: an open
 * peek/expand is an interaction state, not a presence mode, and never
 * justifies viewport-fixed resting objects.
 */
export type PresentationPresetMode = ObjectPlacementMode;

/**
 * AnchorRegion: the page region an edge-presence object belongs to, in
 * DOCUMENT coordinates (scroll-invariant). The object scrolls away with
 * this region; it is never viewport-fixed.
 */
export interface AnchorRegion {
  /** Document-space Y of the region top (rect.top + scrollY at measure time). */
  top: number;
  /** Document-space height of the region. */
  height: number;
  /** How the region was found: a real element, or the viewport fallback. */
  source: "element" | "fallback";
}

/**
 * Resolve the anchor region for edge presence from the host's mount
 * point, without touching host markup:
 * 1. an explicit selector ([data-ping-region] or any CSS selector);
 * 2. the nearest preceding section-like sibling of the mount point
 *    (PortalHost is mounted directly after the region it belongs to,
 *    e.g. the hero section);
 * 3. fallback: document top, one viewport tall (the previous visual
 *    behavior on load, but document-anchored so it scrolls away).
 * Returns null on the server.
 */
export function resolveAnchorRegion(
  mountEl: Element | null,
  selector?: string,
): AnchorRegion | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
  const toRegion = (el: Element): AnchorRegion => {
    const r = el.getBoundingClientRect();
    return {
      top: Math.round(r.top + window.scrollY),
      height: Math.max(0, Math.round(r.height)),
      source: "element",
    };
  };
  if (selector) {
    try {
      const el = document.querySelector(selector);
      if (el) return toRegion(el);
    } catch {
      // Invalid selector: fall through to sibling discovery.
    }
  }
  let sib: Element | null = mountEl ? mountEl.previousElementSibling : null;
  while (sib) {
    if (sib.matches("section, [data-ping-region]")) return toRegion(sib);
    sib = sib.previousElementSibling;
  }
  return { top: 0, height: window.innerHeight, source: "fallback" };
}

/**
 * Rebase viewport-measured slots onto an anchor region: the bands keep
 * their measured horizontal geometry (x/width are scroll-invariant) but
 * their vertical span becomes the region, in document coordinates. Kind
 * is re-derived from the region height; a slot that could not honestly
 * host anything ("none") stays "none". Stability is 1 by construction:
 * document-anchored slots never move on scroll.
 */
export function anchorSlotsToRegion(
  slots: PeripheralSlot[],
  region: AnchorRegion,
): PeripheralSlot[] {
  return slots.map((slot) => {
    const rect: Rect = {
      x: slot.rect.x,
      y: region.top,
      width: slot.rect.width,
      height: region.height,
    };
    const w = rect.width;
    const h = rect.height;
    const kind: SlotKind =
      w >= MIN_SLOT_WIDTH && h >= MIN_SLOT_WIDTH
        ? "band"
        : w >= MIN_PEEK_WIDTH && h >= MIN_PEEK_HEIGHT
          ? "peek"
          : "none";
    const usable = kind !== "none";
    return {
      ...slot,
      rect,
      kind,
      capacity: usable ? (kind === "band" ? w * h : 1) : 0,
      stability: 1,
      collisionRisk: usable ? 0 : 1,
      collapsedD: kind === "band" ? 64 : PEEK_D,
    };
  });
}

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
  /**
   * "band": the full collapsed circle fits inside the measured band.
   * "peek": narrow band; the circle centers on the screen edge so only
   * the in-band sliver shows, never overlapping host content.
   * "none": not even a peek fits; the slot hosts nothing.
   */
  kind: SlotKind;
  /** Collapsed circle diameter this slot hosts (64 for band, 56 for peek). */
  collapsedD: number;
}

/**
 * Minimum band width that can host a collapsed circle.
 * Nolan 2026-09-25 margin directive: the collapsed portal circle is 64px
 * (COLLAPSED_D in portal-circle.tsx). The gate must be glyph size plus a
 * small edge offset, not a conservative 88px that starves real margins:
 * the PING homepage margins measure ~75-80px at 1440, so 88px collapsed
 * every desktop margin to the inline strip. A 64px circle inside a >=72px
 * band never overlaps center content: the band is outside the measured
 * content column by construction.
 */
export const MIN_SLOT_WIDTH = 72;
/**
 * Edge-peek tier (Nolan 2026-09-25 margin directive, round 3): desktop
 * bands narrower than 72px (1280/1366 viewports measure 32..50px on the
 * PING homepage) host a 56px circle centered on the screen edge instead
 * of collapsing to an inline strip. Only the in-band sliver is visible,
 * so host content is never overlapped. Below 28px even a peek would
 * cover content, so the slot reports unusable.
 */
export const PEEK_D = 56;
export const MIN_PEEK_WIDTH = 28;
/** Minimum band height that can stack peek circles. */
export const MIN_PEEK_HEIGHT = 120;

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
    const w = rect.width;
    const h = rect.height;
    const kind: SlotKind =
      w >= MIN_SLOT_WIDTH && h >= MIN_SLOT_WIDTH
        ? "band"
        : w >= MIN_PEEK_WIDTH && h >= MIN_PEEK_HEIGHT
          ? "peek"
          : "none";
    const usable = kind !== "none";
    return {
      id: b.id,
      rect,
      side: b.side,
      capacity: usable ? (kind === "band" ? w * h : 1) : 0,
      stability: 1,
      collisionRisk: usable ? 0 : 1,
      kind,
      collapsedD: kind === "band" ? 64 : PEEK_D,
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

export interface SlotManagerOptions {
  /**
   * Document-anchored consumers (edge presence) position from
   * scroll-invariant document coordinates, so scroll never invalidates
   * the measurement: pass false to skip the scroll listener. Defaults
   * to true (viewport-anchored consumers).
   */
  observeScroll?: boolean;
}

/**
 * Observe geometry invalidation and recompute slots. ResizeObserver +
 * passive RAF-throttled scroll + selective MutationObserver (childList on
 * body, debounced). No firehose: mutations debounce to 250ms.
 */
export function createSlotManager(
  onSlots: (slots: PeripheralSlot[]) => void,
  opts: SlotManagerOptions = {},
): SlotManager {
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
  const observeScroll = opts.observeScroll !== false;
  if (observeScroll) window.addEventListener("scroll", onScroll, { passive: true });
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
      if (observeScroll) window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      ro?.disconnect();
      mo?.disconnect();
    },
  };
}
