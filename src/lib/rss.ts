/**
 * Blog RSS feed builder (Wave 28, B-21).
 *
 * The blog had no feed at all before this wave: the only RSS in the
 * codebase was the external podcast feed for The Long Ping episodes
 * (anchor.fm, in src/lib/longping-media.ts). That feed carries episode
 * audio, a different medium, and it stays untouched. This builder is
 * posts only: one item per published blog post from the blog data
 * layer, in exactly the order the layer returns them. The layer
 * (readAllPosts in src/lib/blog.ts) sorts by date descending, so the
 * feed comes out newest first because the layer sorts that way; this
 * builder deliberately adds no sort of its own.
 *
 * Channel title and description are the blog index page real title
 * and description from src/app/blog/page.tsx metadata, copied here as
 * constants so the feed channel cannot invent its own identity.
 */

export const BLOG_FEED_TITLE = "Blog: Build Notes and Essays From PING";
export const BLOG_FEED_DESCRIPTION =
  "PING build notes and The Long Ping on film: architecture, implementation, and the reasoning behind both, plus every episode with its Shorts and transcripts.";

export interface RssFeedPost {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
}

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Format a post date (YYYY-MM-DD) as an RSS pubDate in RFC 822 form,
 * for example Tue, 03 Nov 2026 00:00:00 GMT. The date is taken at UTC
 * midnight, matching how the blog and sitemap interpret post dates.
 */
export function formatRssDate(date: string): string {
  return new Date(date + "T00:00:00Z").toUTCString();
}

export function buildRssFeed(posts: readonly RssFeedPost[], siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, "");
  const channelLink = base + "/blog";
  const items = posts
    .map((post) => {
      const url = base + "/blog/" + post.slug;
      return [
        "    <item>",
        "      <title>" + escapeXml(post.title) + "</title>",
        "      <link>" + escapeXml(url) + "</link>",
        "      <guid isPermaLink=\"true\">" + escapeXml(url) + "</guid>",
        "      <pubDate>" + formatRssDate(post.date) + "</pubDate>",
        "      <description>" + escapeXml(post.excerpt) + "</description>",
        "    </item>",
      ].join("\n");
    })
    .join("\n");
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<rss version=\"2.0\" xmlns:atom=\"http://www.w3.org/2005/Atom\">",
    "  <channel>",
    "    <title>" + escapeXml(BLOG_FEED_TITLE) + "</title>",
    "    <link>" + escapeXml(channelLink) + "</link>",
    "    <description>" + escapeXml(BLOG_FEED_DESCRIPTION) + "</description>",
    "    <atom:link href=\"" + escapeXml(base + "/rss.xml") + "\" rel=\"self\" type=\"application/rss+xml\" />",
    items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
