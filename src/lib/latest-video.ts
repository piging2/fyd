import type { FeaturedVideo } from "@/lib/longping-media";

/**
 * The homepage featured slot tracks the most recent public video on the
 * PingFyd YouTube channel (@pingfyd). Resolved server-side from the
 * channel public RSS feed with hourly revalidation. Any failure falls
 * back to the last verified video below, so the slot is never blank and
 * never shows an error state.
 *
 * The fallback is the resolver's own last verified answer, shaped
 * exactly like a live answer. Root cause of the long fallback era,
 * found and repaired 2026-11-26: the feed parser's field reader
 * built its pattern from a double-quoted string whose backslash
 * collapsed, so no real entry could ever parse and every resolution
 * fell back, whatever the fetch returned. The fetch itself is
 * proven live in this runtime: GET /api/featured-video reads the
 * feed's newest entry in both the resolver's cached form and a
 * plain no-store form (verified at destination 2026-11-26). The
 * fallback below is therefore a safety net only, deliberately an
 * older verified entry, so a served fallback is visible as one.
 */
const LAST_VERIFIED_VIDEO: FeaturedVideo = {
  id: "ilkHr7tO4mU",
  title: "AI Got Possessed by Good Architecture | The Long Ping EP4: Halloween Preview",
  kind: "Film",
  watchUrl: "https://www.youtube.com/watch?v=ilkHr7tO4mU",
  thumbnail: "https://i.ytimg.com/vi/ilkHr7tO4mU/hqdefault.jpg",
  thumbnailCard: "https://i.ytimg.com/vi/ilkHr7tO4mU/hqdefault.jpg",
  thumbnailFallback: "https://i.ytimg.com/vi/ilkHr7tO4mU/hqdefault.jpg",
  blurb: "The latest film from The Long Ping, straight from the PingFyd channel on YouTube.",
};

const CHANNEL_FEED_URL =
  "https://www.youtube.com/feeds/videos.xml?channel_id=UCsl7RnATG9bn--EWh2davTQ";

function firstEntryField(entry: string, tag: string): string | null {
  const open = "<" + tag + ">";
  const close = "</" + tag + ">";
  const start = entry.indexOf(open);
  if (start < 0) return null;
  const end = entry.indexOf(close, start + open.length);
  if (end < 0) return null;
  return entry.slice(start + open.length, end).trim();
}

/** The feed's first entry (its newest), or null when unparseable. */
function firstEntry(xml: string): { id: string; title: string; link: string } | null {
  const entry = xml.split("<entry>")[1];
  if (!entry) return null;
  const id = firstEntryField(entry, "yt:videoId");
  const title = firstEntryField(entry, "title");
  if (!id || !title) return null;
  const linkMatch = entry.match(/<link rel="alternate" href="([^"]+)"/);
  const link = linkMatch ? linkMatch[1] : "https://www.youtube.com/watch?v=" + id;
  return { id, title, link };
}

export async function getFeaturedVideo(): Promise<FeaturedVideo> {
  try {
    const response = await fetch(CHANNEL_FEED_URL, {
      next: { revalidate: 3600 },
      headers: { "user-agent": "fyd-product featured-video resolver" },
    });
    if (!response.ok) return LAST_VERIFIED_VIDEO;
    const xml = await response.text();
    const first = firstEntry(xml);
    if (!first) return LAST_VERIFIED_VIDEO;
    const { id, title, link } = first;
    const isShort = link.includes("/shorts/");
    return {
      id,
      title,
      kind: isShort ? "Short" : "Film",
      watchUrl: link,
      thumbnail: "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg",
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

export interface FeedProbeOutcome {
  ok: boolean;
  status: number | null;
  videoId: string | null;
  title: string | null;
  error: string | null;
}

async function probeVariant(init: RequestInit): Promise<FeedProbeOutcome> {
  try {
    const response = await fetch(CHANNEL_FEED_URL, init);
    if (!response.ok) {
      return { ok: false, status: response.status, videoId: null, title: null, error: null };
    }
    const first = firstEntry(await response.text());
    if (!first) {
      return { ok: false, status: response.status, videoId: null, title: null, error: "unparseable_feed" };
    }
    return { ok: true, status: response.status, videoId: first.id, title: first.title, error: null };
  } catch (err) {
    return {
      ok: false,
      status: null,
      videoId: null,
      title: null,
      error: err instanceof Error ? err.name : "unknown",
    };
  }
}

/**
 * The featured-video sync, observable: runs the feed fetch in the
 * resolver's own cached form and in a plain no-store form and reports
 * both outcomes. Served at /api/featured-video so the mechanism is
 * proven or disproven at destination, on evidence.
 */
export async function probeFeaturedVideoFetch(): Promise<{
  at: string;
  fallbackVideoId: string;
  resolverForm: FeedProbeOutcome;
  plainForm: FeedProbeOutcome;
}> {
  const headers = { "user-agent": "fyd-product featured-video resolver" };
  const resolverForm = await probeVariant({ next: { revalidate: 3600 }, headers });
  const plainForm = await probeVariant({ cache: "no-store", headers });
  return { at: new Date().toISOString(), fallbackVideoId: LAST_VERIFIED_VIDEO.id, resolverForm, plainForm };
}
