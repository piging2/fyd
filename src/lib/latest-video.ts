import { featuredFilm, type FeaturedVideo } from "@/lib/longping-media";

/**
 * The homepage featured slot tracks the most recent public video on the
 * PingFyd YouTube channel (@PingSoc). Resolved server-side from the
 * channel public RSS feed with hourly revalidation. Any failure falls
 * back to the static featuredFilm entry, so the slot is never blank and
 * never shows an error state.
 */
const CHANNEL_FEED_URL =
  "https://www.youtube.com/feeds/videos.xml?channel_id=UCsl7RnATG9bn--EWh2davTQ";

function firstEntryField(entry: string, tag: string): string | null {
  const match = entry.match(new RegExp("<" + tag + ">([\s\S]*?)</" + tag + ">"));
  return match ? match[1].trim() : null;
}

export async function getFeaturedVideo(): Promise<FeaturedVideo> {
  try {
    const response = await fetch(CHANNEL_FEED_URL, {
      next: { revalidate: 3600 },
      headers: { "user-agent": "fyd-product featured-video resolver" },
    });
    if (!response.ok) return featuredFilm;
    const xml = await response.text();
    const entry = xml.split("<entry>")[1];
    if (!entry) return featuredFilm;
    const id = firstEntryField(entry, "yt:videoId");
    const title = firstEntryField(entry, "title");
    if (!id || !title) return featuredFilm;
    const linkMatch = entry.match(/<link rel="alternate" href="([^"]+)"/);
    const link = linkMatch ? linkMatch[1] : "https://www.youtube.com/watch?v=" + id;
    const isShort = link.includes("/shorts/");
    return {
      id,
      title,
      kind: isShort ? "Short" : "Film",
      watchUrl: link,
      thumbnail: "https://i.ytimg.com/vi/" + id + "/maxresdefault.jpg",
      thumbnailCard: "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg",
      thumbnailFallback: "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg",
      blurb: isShort
        ? "The latest Short from The Long Ping, straight from the PingFyd channel on YouTube."
        : "The latest film from The Long Ping, straight from the PingFyd channel on YouTube.",
    };
  } catch {
    return featuredFilm;
  }
}
