/**
 * Owner-selected hero override (fyd-media@2 lane-media).
 *
 * Binding (FYD mobile object experience rebuild, 2026-09-23): hero
 * selection is deterministic, with the business owner's selection
 * outranking the automatic selection.
 *
 * heroMediaFor() (select.ts) is the automatic selector. This module is
 * the ONLY owner-override seam: it wraps heroMediaFor and applies the
 * owner's recorded choice when it is valid. The override is validated,
 * not trusted: a stale, mistyped, revoked, or rights-rejected owner
 * selection falls back to the automatic result, and the resolution
 * records the basis plus a machine-readable note (consumed by the
 * "Why this?" affordance) explaining what happened.
 *
 * Deterministic: same site, graph, object, and owner id -> same
 * resolution. No network, no mutation. The auto selector is untouched;
 * this module is additive.
 */

import { heroMediaFor, listObjectMedia, type DisplayMedia } from "./select";
import type { ObjectGraph } from "../sitespec/types";

export type HeroResolutionBasis = "owner" | "auto" | "owner-fallback";

export interface HeroResolution {
  /** The media to render (null: the caller renders its typographic hero). */
  media: DisplayMedia | null;
  /** "owner": the owner's pick won. "auto": no owner pick given.
   *  "owner-fallback": an owner pick was given but could not be honored. */
  basis: HeroResolutionBasis;
  /** The owner-selected media id as passed in, or null. */
  ownerSelectedId: string | null;
  /** Human/machine sentence describing the resolution. Never empty. */
  note: string;
}

/**
 * Resolve the hero media for an object, honoring the owner's recorded
 * selection when it is valid. The owner id must name an acquired,
 * photographic (non-logo), variant-bearing asset attached to the
 * object; anything else falls back to the automatic selection.
 *
 * @param ownerHeroId the business owner's selected media id (the media
 *   object's `id`, e.g. "fyd-media-<16 hex>"), or null/undefined when the
 *   owner has not selected one.
 */
export function resolveHeroMedia(
  siteId: string,
  graph: ObjectGraph,
  objectId: string,
  ownerHeroId: string | null | undefined,
): HeroResolution {
  const auto = heroMediaFor(siteId, graph, objectId);
  if (!ownerHeroId) {
    return {
      media: auto,
      basis: "auto",
      ownerSelectedId: null,
      note: auto
        ? "Automatic hero selection: hero-role asset preferred, else the best photographic acquired asset."
        : "Automatic hero selection: no photographic acquired media; the caller renders its typographic fallback.",
    };
  }
  // The owner's pick resolves through the same DisplayMedia projection
  // as every other consumer (semantic attachment, rights gate, variant
  // pick). Not present here means not acquirable or not attached to
  // this object: never honored.
  const candidates = listObjectMedia(siteId, graph, objectId);
  const chosen = candidates.find((d) => d.id === ownerHeroId) ?? null;
  if (chosen && chosen.role !== "logo") {
    return {
      media: chosen,
      basis: "owner",
      ownerSelectedId: ownerHeroId,
      note:
        "Owner-selected hero (" +
        ownerHeroId +
        ") outranks the automatic selection.",
    };
  }
  const reason = !chosen
    ? "it does not name an acquired asset attached to this object (stale, mistyped, revoked, or rights-rejected)"
    : "a logo is brand identity, not a photographic hero, and can never be the hero";
  return {
    media: auto,
    basis: "owner-fallback",
    ownerSelectedId: ownerHeroId,
    note:
      "Owner selection (" +
      ownerHeroId +
      ") could not be honored: " +
      reason +
      ". Fell back to the automatic selection.",
  };
}
