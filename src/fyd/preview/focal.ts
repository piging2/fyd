/**
 * Deterministic focal-region system for circle previews.
 *
 * A whole desktop screenshot scaled into a circle becomes unreadable, so
 * every preview record carries an explicit focal point and the circle
 * renders object-fit: cover with object-position at that focal point.
 * Resolution order is fixed and logged: owner-selected region first,
 * deterministic default last.
 */

export interface FocalPoint {
  /** 0..1 across the source image width. */
  x: number;
  /** 0..1 down the source image height. */
  y: number;
}

export interface FocalHints {
  ownerFocal?: FocalPoint | null;
  siteSpecHero?: boolean;
  heroImage?: boolean;
  ogImage?: boolean;
  logo?: boolean;
}

export interface FocalDecision {
  focal: FocalPoint;
  /** Human-readable basis, stored with the preview record. */
  basis: string;
}

/** Upper-center hero zone: where business sites put their identity. */
const DEFAULT_FOCAL: FocalPoint = { x: 0.5, y: 0.3 };

function clamp(f: FocalPoint): FocalPoint {
  return {
    x: Math.min(1, Math.max(0, f.x)),
    y: Math.min(1, Math.max(0, f.y)),
  };
}

export function resolveFocal(hints: FocalHints): FocalDecision {
  if (hints.ownerFocal) {
    return { focal: clamp(hints.ownerFocal), basis: "Owner-selected focal region" };
  }
  if (hints.siteSpecHero) {
    return { focal: { ...DEFAULT_FOCAL }, basis: "SiteSpec hero region" };
  }
  if (hints.heroImage) {
    return { focal: { ...DEFAULT_FOCAL }, basis: "Hero image region" };
  }
  if (hints.ogImage) {
    return { focal: { x: 0.5, y: 0.5 }, basis: "OpenGraph image (center)" };
  }
  if (hints.logo) {
    return { focal: { x: 0.5, y: 0.5 }, basis: "Logo mark (center)" };
  }
  return {
    focal: { ...DEFAULT_FOCAL },
    basis: "Deterministic default: upper-center hero zone",
  };
}

/** CSS object-position value for the focal point, e.g. "50% 30%". */
export function focalToObjectPosition(f: FocalPoint): string {
  return `${Math.round(f.x * 100)}% ${Math.round(f.y * 100)}%`;
}
