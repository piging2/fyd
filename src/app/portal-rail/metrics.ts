/**
 * Rail placement metrics (client).
 *
 * Measures the live geometry of the placement harness: the content
 * column, the free margins on each side (minus any PING chrome), the
 * portal's own bounding box, and the two hard invariants the placement
 * strategy must hold:
 *
 *   overlapPx   = 0  (the portal never covers customer content)
 *   hOverflowPx = 0  (the rail never pushes the page wider than the viewport)
 *
 * Every measurement is exposed on window.__railMetrics so later capture
 * lanes can read it from the page or automation.
 */

export interface PortalBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type MeasuredSide = "left" | "right" | "none";

export interface RailMetrics {
  contentWidth: number;
  /** Free px between the viewport's left edge and the content column, minus PING chrome. */
  leftFree: number;
  /** Free px between the content column and the viewport's right edge. */
  rightFree: number;
  portalBox: PortalBox | null;
  /** Intersection area of the portal bbox with the content column bbox; must be 0. */
  overlapPx: number;
  /** document scrollWidth minus viewport width, clamped at 0; must be 0. */
  hOverflowPx: number;
  side: MeasuredSide;
  mode: "static" | "sticky";
  scrollY: number;
}

declare global {
  interface Window {
    __railMetrics?: RailMetrics;
  }
}

export interface RailGeometry {
  contentEl: HTMLElement | null;
  portalEl: HTMLElement | null;
  /** Fixed PING chrome overlaying the left margin (the readout panel). */
  chromeEl: HTMLElement | null;
}

/** Intersection area of two DOMRects in viewport coordinates. */
export function intersectionArea(a: DOMRect, b: DOMRect): number {
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return x * y;
}

export function computeRailMetrics(
  geom: RailGeometry,
  side: MeasuredSide,
  mode: "static" | "sticky",
): RailMetrics {
  const vw = window.innerWidth;
  const contentRect = geom.contentEl?.getBoundingClientRect() ?? null;
  const portalRect = geom.portalEl?.getBoundingClientRect() ?? null;
  const chromeRect = geom.chromeEl?.getBoundingClientRect() ?? null;

  const contentWidth = contentRect ? Math.round(contentRect.width) : 0;
  // Free margin outside the content column, minus any PING chrome that
  // occupies the margin (the on-screen readout sits fixed at top-left,
  // so the left margin loses its footprint).
  const chromeInset = chromeRect ? Math.max(0, chromeRect.right + 8) : 0;
  const leftFree = contentRect
    ? Math.max(0, Math.round(contentRect.left - chromeInset))
    : 0;
  const rightFree = contentRect
    ? Math.max(0, Math.round(vw - contentRect.right))
    : 0;

  const portalBox: PortalBox | null = portalRect
    ? {
        x: Math.round(portalRect.x),
        y: Math.round(portalRect.y),
        width: Math.round(portalRect.width),
        height: Math.round(portalRect.height),
      }
    : null;

  // Invariant: the portal must never cover the customer content column.
  const overlapPx =
    contentRect && portalRect && portalBox
      ? Math.round(intersectionArea(contentRect, portalRect))
      : 0;

  // Invariant: the rail must never make the page horizontally scrollable.
  const hOverflowPx = Math.max(
    0,
    Math.round(document.documentElement.scrollWidth - vw),
  );

  return {
    contentWidth,
    leftFree,
    rightFree,
    portalBox,
    overlapPx,
    hOverflowPx,
    side,
    mode,
    scrollY: Math.round(window.scrollY),
  };
}

export interface RailMetricsHandle {
  refresh: () => RailMetrics;
  dispose: () => void;
}

/**
 * Install live measurement: refreshes on load, resize, and scroll with
 * rAF throttling, writes every result to window.__railMetrics, and calls
 * onUpdate for the on-screen readout. The geometry resolver runs on
 * every refresh so React refs may settle after install. Returns a handle
 * to refresh or dispose.
 */
export function installRailMetrics(
  resolve: () => RailGeometry & {
    side: MeasuredSide;
    mode: "static" | "sticky";
  },
  onUpdate: (m: RailMetrics) => void,
): RailMetricsHandle {
  let raf = 0;
  let disposed = false;

  const refresh = (): RailMetrics => {
    const { contentEl, portalEl, chromeEl, side, mode } = resolve();
    const m = computeRailMetrics({ contentEl, portalEl, chromeEl }, side, mode);
    window.__railMetrics = m;
    onUpdate(m);
    return m;
  };

  const schedule = () => {
    if (raf || disposed) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      if (!disposed) refresh();
    });
  };

  window.addEventListener("load", refresh);
  window.addEventListener("resize", schedule);
  window.addEventListener("scroll", schedule, { passive: true });
  // The load listener may already have fired before install; refresh once
  // shortly after mount so metrics exist for first paint.
  const t = window.setTimeout(refresh, 50);

  return {
    refresh,
    dispose: () => {
      disposed = true;
      if (raf) window.cancelAnimationFrame(raf);
      window.clearTimeout(t);
      window.removeEventListener("load", refresh);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule);
    },
  };
}
