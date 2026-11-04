/**
 * Per-episode landing page data for The Long Ping (B-12, first slice).
 *
 * Built only from the verified media inventory in @/lib/longping-media:
 * the featured film plus the episode videos. Nothing is invented here:
 * episodes without a duration in the inventory stay without one, and no
 * dates exist in the inventory, so none are published.
 *
 * Slugs are stable title slugs. They match the episode order already used
 * by the blog episode navigation (what-survives-10000-years,
 * the-water-wheel-problem, the-grid-problem), and each entry keeps the
 * inventory id next to its slug so the mapping is auditable.
 */

import { episodeVideos, featuredFilm, type FeaturedVideo } from "@/lib/longping-media";

export interface EpisodePage {
  slug: string;
  video: FeaturedVideo;
  /**
   * Meta description for the landing page, in the site 147 to 160
   * character band. Derived only from the episode own blurb and facts:
   * the two over band blurbs are trimmed subsets of the blurb, and the
   * under band blurb is extended with the closing fact of its matching
   * blog post (the argument never actually ended). The blurb itself is
   * unchanged, so cards and other surfaces that show it are untouched.
   */
  description: string;
}

/** Series order: Episode 1, Episode 2, then the featured film (Episode 3). */
export const episodePages: EpisodePage[] = [
  {
    slug: "what-survives-10000-years",
    video: episodeVideos.find((v) => v.id === "ekJnwDb7ssw")!,
    description:
      "Episode 1: if everyone maintaining your world disappeared tonight, what would still be true in ten thousand years? Five hours on preservation and memory.",
  },
  {
    slug: "the-water-wheel-problem",
    video: episodeVideos.find((v) => v.id === "ibgccWqthsw")!,
    description:
      "Episode 2, chapters 1-10: the water wheel, the grid it built, and the long argument between centralised and distributed power, an argument that never ended.",
  },
  {
    slug: "the-grid-problem",
    video: featuredFilm,
    description:
      "Episode 3 of The Long Ping, in full: three hours and forty-three minutes on how power grids fail, why they fail the way they do, and what the failures teach.",
  },
];

export function getEpisodePage(slug: string): EpisodePage | null {
  return episodePages.find((e) => e.slug === slug) ?? null;
}

/**
 * Convert an inventory duration like "3h 43m" to ISO 8601 (PT3H43M).
 * Returns null when the inventory has no duration for the episode, so
 * callers omit the field instead of guessing.
 */
export function durationToIso8601(duration?: string): string | null {
  if (!duration) return null;
  const m = duration.match(/^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?$/);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  let out = "PT";
  if (m[1]) out += m[1] + "H";
  if (m[2]) out += m[2] + "M";
  if (m[3]) out += m[3] + "S";
  return out;
}

/** YouTube embed URL derived from the verified video id in the inventory. */
export function embedUrlFor(video: FeaturedVideo): string {
  return "https://www.youtube.com/embed/" + video.id;
}
