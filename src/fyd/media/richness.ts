/**
 * FYD media richness (media-intelligence lane 5, design sprint 2026-09-26).
 *
 * Pure, deterministic quality/richness scoring over FydMediaObject so a
 * composition compiler can rank "which photo carries the page". No
 * randomness, no clock, no network: same manifest -> same scores -> same
 * selection. Scores are data, not judgment: every component is a
 * documented function of manifest fields.
 *
 * Scoring formula (all components 0..1):
 *
 *   resolution  = min(1, sqrt(pixelArea / REF_AREA))
 *                 REF_AREA = 1920*1080. Square-root scaling keeps small
 *                 thumbnails near zero without pretending a 4K source is
 *                 four times better than a 1080p one.
 *   role        = max over roles of the surface-worthiness table:
 *                 hero 1.0, gallery 0.8, project/service 0.75,
 *                 location/team 0.7, card 0.5, logo 0.2, thumbnail 0.1.
 *                 A logo scores low on purpose: brand identity is not
 *                 photography and must never win a photographic surface.
 *   provenance  = business-provided 1.0, public-demo-source 0.7,
 *                 unclear-reference-only 0.0.
 *   alt         = altTextSource: source 1.0, generated 0.6, none 0.0.
 *                 Rewards the alt-text backfill without pretending a
 *                 generated alt is source truth.
 *   focal       = 1.0 when a finite focalPoint in 0..1 is present,
 *                 else 0.0. Rewards art-directable assets.
 *
 *   richness = 0.35*resolution + 0.25*role + 0.20*provenance
 *              + 0.10*alt + 0.10*focal
 *
 * The weights encode the product law: photographic substance first
 * (resolution + role = 0.60), authorization basis next (0.20), metadata
 * completeness last (0.20). Weights are constants below, not caller
 * parameters, so two callers can never disagree.
 *
 * Gallery dimension gate (isGalleryEligible): a gallery grid shows
 * photographs, not brand badges. Assets narrower than 300px or shorter
 * than 200px are excluded. In the committed manifests the five
 * Coppersmith manufacturer badges are 118-200px wide and all fail; the
 * smallest real photograph in either manifest is 600x600 and passes.
 * Missing data (no manifest entry) is eligible: absence of evidence is
 * not evidence of a bad photo, and the gate must never nuke a gallery
 * on a read hiccup.
 */

import type { FydMediaObject } from "./types";

/** Reference pixel area for the resolution component (1920x1080). */
export const RICHNESS_REF_AREA = 1920 * 1080;

/** Minimum original dimensions for a gallery-grid photograph. */
export const GALLERY_MIN_WIDTH = 300;
export const GALLERY_MIN_HEIGHT = 200;

/** Fixed weights. Not caller parameters: two callers can never disagree. */
export const RICHNESS_WEIGHTS = {
  resolution: 0.35,
  role: 0.25,
  provenance: 0.2,
  alt: 0.1,
  focal: 0.1,
} as const;

/** Surface-worthiness of each role for photographic surfaces. */
const ROLE_WORTH: Record<string, number> = {
  hero: 1.0,
  gallery: 0.8,
  project: 0.75,
  service: 0.75,
  location: 0.7,
  team: 0.7,
  card: 0.5,
  logo: 0.2,
  thumbnail: 0.1,
};

export interface MediaRichness {
  /** Weighted total, 0..1, rounded to 4 decimals for stable equality. */
  score: number;
  resolution: number;
  role: number;
  provenance: number;
  alt: number;
  focal: number;
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

function resolutionScore(m: FydMediaObject): number {
  const area = (m.width || 0) * (m.height || 0);
  if (area <= 0) return 0;
  return clamp01(Math.sqrt(area / RICHNESS_REF_AREA));
}

function roleScore(m: FydMediaObject): number {
  const roles = m.roles ?? [];
  if (roles.length === 0) return 0.3;
  return clamp01(Math.max(...roles.map((r) => ROLE_WORTH[r] ?? 0.3)));
}

function provenanceScore(m: FydMediaObject): number {
  switch (m.rightsSource) {
    case "business-provided":
      return 1.0;
    case "public-demo-source":
      return 0.7;
    case "unclear-reference-only":
      return 0.0;
    default:
      return 0.0;
  }
}

function altScore(m: FydMediaObject): number {
  switch (m.altTextSource) {
    case "source":
      return 1.0;
    case "generated":
      return 0.6;
    case "none":
    default:
      return 0.0;
  }
}

function focalScore(m: FydMediaObject): number {
  const f = m.focalPoint;
  if (!f) return 0;
  const ok = (n: unknown): n is number =>
    typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;
  return ok(f.x) && ok(f.y) ? 1.0 : 0.0;
}

/**
 * Deterministic richness score for one media object. Pure: no I/O, no
 * clock, no randomness.
 */
export function scoreMedia(m: FydMediaObject): MediaRichness {
  const resolution = resolutionScore(m);
  const role = roleScore(m);
  const provenance = provenanceScore(m);
  const alt = altScore(m);
  const focal = focalScore(m);
  const w = RICHNESS_WEIGHTS;
  const score =
    w.resolution * resolution +
    w.role * role +
    w.provenance * provenance +
    w.alt * alt +
    w.focal * focal;
  return {
    score: Math.round(clamp01(score) * 10000) / 10000,
    resolution: Math.round(resolution * 10000) / 10000,
    role,
    provenance,
    alt,
    focal,
  };
}

/**
 * Rank media by richness, highest first. Stable: ties break by id
 * ascending, so the same manifest always yields the same order.
 */
export function rankByRichness<T extends FydMediaObject>(list: T[]): T[] {
  const scored = list.map((m) => ({ m, s: scoreMedia(m).score }));
  scored.sort((a, b) => b.s - a.s || (a.m.id < b.m.id ? -1 : a.m.id > b.m.id ? 1 : 0));
  return scored.map((x) => x.m);
}

/**
 * The gallery dimension gate. A gallery grid shows photographs; tiny
 * brand-badge assets (the 118-200px manufacturer badges in the
 * Coppersmith manifest) are not photographs and are excluded here.
 * Missing manifest data is eligible: absence of evidence is not evidence
 * of a bad photo.
 */
export function isGalleryEligible(
  m: FydMediaObject | null | undefined,
): boolean {
  if (!m) return true;
  return (m.width || 0) >= GALLERY_MIN_WIDTH && (m.height || 0) >= GALLERY_MIN_HEIGHT;
}
