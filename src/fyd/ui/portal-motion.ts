/** Viewport geometry of the existing mark, including its current hover scale. */
export interface PortalOrigin {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Start the panel at the visible mark without changing either placement. */
export function portalOriginTransform(
  origin: PortalOrigin,
  destination: { x: number; y: number },
  diameter: number,
) {
  return {
    x: origin.x - destination.x,
    y: origin.y - destination.y,
    scaleX: origin.width / diameter,
    scaleY: origin.height / diameter,
  };
}

/**
 * First-stage expansion cap (Nolan 2026-10-02): the first click opens a
 * compact object, never a page-filling panel. The desktop engaged diameter
 * is clamped to this; mobile uses the compact popup stage instead.
 */
export const FIRST_STAGE_MAX_D = 300;

/** Clamp an engaged diameter to the compact first-stage size. */
export function compactEngagedDiameter(d: number): number {
  return Math.min(d, FIRST_STAGE_MAX_D);
}
