import type { FeaturedVideo } from "@/lib/longping-media";

/**
 * The homepage featured slot tracks the most recent public video on the
 * PingFyd YouTube channel (@PingSoc). Resolved server-side from the
 * channel public RSS feed with hourly revalidation. Any failure falls
 * back to the last verified video below, so the slot is never blank and
 * never shows an error state.
 *
 * The fallback is the resolver's own last verified answer, shaped
 * exactly like a live answer: the channel RSS was read and verified
 * from two network egresses on 2026-11-07 (the feed had returned 404
 * since 2026-11-04), while the production fetch has fallen back on
 * every prerender since, so the live fetch and this fallback currently
 * name the same video. When the rotation's feed check finds a newer
 * entry the live fetch has not picked up, update the fallback.
 */
const LAST_VERIFIED_VIDEO: FeaturedVideo = {
  id: "ilkHr7tO4mU",
  title: "AI Got Possessed by Good Architecture | The Long Ping EP4: Halloween Preview",
  kind: "Film",
  watchUrl: "https://www.youtube.com/watch?v=ilkHr7tO4mU",
  thumbnail: "https://i.ytimg.com/vi/ilkHr7tO4mU/maxresdefault.jpg",
  thumbnailCard: "https://i.ytimg.com/vi/ilkHr7tO4mU/hqdefault.jpg",
  thumbnailFallback: "https://i.ytimg.com/vi/ilkHr7tO4mU/hqdefault.jpg",
  blurb: "The latest film from The Long Ping, straight from the PingFyd channel on YouTube.",
};

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
    if (!response.ok) return LAST_VERIFIED_VIDEO;
    const xml = await response.text();
    const entry = xml.split("<entry>")[1];
    if (!entry) return LAST_VERIFIED_VIDEO;
    const id = firstEntryField(entry, "yt:videoId");
    const title = firstEntryField(entry, "title");
    if (!id || !title) return LAST_VERIFIED_VIDEO;
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
    return LAST_VERIFIED_VIDEO;
  }
}
