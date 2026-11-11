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

import { renderMarkdown, toPlainText, type BlogHeading } from "@/lib/blog";
import { episodeVideos, featuredFilm, type FeaturedVideo } from "@/lib/longping-media";

export interface EpisodePage {
  slug: string;
  video: FeaturedVideo;
  /** Use the episode title when its current provider artwork names another film. */
  useTitlePlate?: boolean;
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
    video: episodeVideos.find((v) => v.id === "7ljMOGuKKv8")!,
    useTitlePlate: true,
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

/**
 * Unified episode page title construction (Wave 29, regrade defect 8).
 *
 * The stored video titles in @/lib/longping-media are the verified
 * YouTube inventory titles and stay untouched: Episodes 1 and 2 store
 * "The Long Ping, Episode N: Title" while Episode 3 stores
 * "Title | The Long Ping", so the page titles inherited that split.
 * The pattern lives here instead: strip either stored decoration to
 * the episode short title, then rebuild every title as
 * "The Long Ping, Episode N: Short Title". The root layout template
 * appends " · PING", giving the same shape as the site other titles
 * (a descriptive subject followed by the brand suffix, as on the blog
 * and technology pages), with the episode number every title should
 * carry. Rendered lengths: 59, 72, and 49 characters, all under 75.
 */
export function episodeShortTitle(videoTitle: string): string {
  return videoTitle
    .replace(/^The Long Ping, Episode \d+:\s*/, "")
    .replace(/\s*\| The Long Ping$/, "")
    .trim();
}

export function buildEpisodePageTitle(entry: EpisodePage): string {
  const idx = episodePages.findIndex((e) => e.slug === entry.slug);
  const short = episodeShortTitle(entry.video.title);
  if (idx < 0) return short;
  return "The Long Ping, Episode " + (idx + 1) + ": " + short;
}

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

/**
 * Episode depth sections (Wave 26, regrade defect 1 full prescription).
 *
 * The audit prescribed, per episode page: a summary, a chapter or topic
 * list, and an excerpt. All three are derived here from the matching
 * published blog post body, which the page passes in from the blog data
 * layer (@/lib/blog getPost). Nothing is hand copied into this module,
 * so the sections cannot drift from the posts themselves. A post that
 * yields no prose paragraph or no section heading returns null, and the
 * page then renders no depth sections at all (dangling data guard).
 *
 * Labeling note: the matching posts are written breakdowns and companion
 * essays, not transcripts, so the excerpt is labeled From the written
 * breakdown, never as a transcript excerpt.
 */
export interface EpisodeBreakdownDepth {
  /** The post real opening: its first substantive prose paragraph. */
  summary: string;
  /** The post actual section headings, in order. */
  topics: BlogHeading[];
  /** A short excerpt from the post: its closing prose paragraph. */
  excerpt: string;
}

export function buildEpisodeDepth(body: string): EpisodeBreakdownDepth | null {
  const topics = renderMarkdown(body).headings.filter(({ level, label }) => level > 1 && label);
  const paragraphs: string[] = [];
  for (const block of body.split(/\n\s*\n/)) {
    const t = block.trim();
    if (!t) continue;
    if (
      t.startsWith("#") ||
      t.startsWith("!") ||
      t.startsWith("-") ||
      t.startsWith("* ") ||
      t.startsWith(">") ||
      t.startsWith("```")
    ) {
      continue;
    }
    const plain = toPlainText(t.replace(/\n/g, " "));
    if (plain) paragraphs.push(plain);
  }
  if (paragraphs.length === 0 || topics.length === 0) return null;
  return {
    summary: paragraphs[0],
    topics,
    excerpt: paragraphs[paragraphs.length - 1],
  };
}
