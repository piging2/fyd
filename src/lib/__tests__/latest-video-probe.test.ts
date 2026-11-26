import { probeFeaturedVideoFetch } from "@/lib/latest-video";

const FEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <title>PingFyd</title>
  <entry>
    <yt:videoId>abc123XYZ</yt:videoId>
    <title>Newest Entry Title</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=abc123XYZ"/>
    <published>2026-11-08T21:34:51+00:00</published>
  </entry>
  <entry>
    <yt:videoId>older999</yt:videoId>
    <title>Older Entry</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=older999"/>
  </entry>
</feed>`;

describe("probeFeaturedVideoFetch", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("reports the first entry for a working form and the failure for a throwing form", async () => {
    let call = 0;
    global.fetch = (async () => {
      call += 1;
      if (call === 1) {
        return { ok: true, status: 200, text: async () => FEED_XML } as Response;
      }
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const probe = await probeFeaturedVideoFetch();
    expect(probe.resolverForm).toEqual({
      ok: true,
      status: 200,
      videoId: "abc123XYZ",
      title: "Newest Entry Title",
      error: null,
    });
    expect(probe.plainForm.ok).toBe(false);
    expect(probe.plainForm.error).toBe("TypeError");
    expect(probe.fallbackVideoId).toBe("ilkHr7tO4mU");
  });

  it("reports a non-OK status without inventing a video", async () => {
    global.fetch = (async () =>
      ({ ok: false, status: 404, text: async () => "" }) as Response) as typeof fetch;
    const probe = await probeFeaturedVideoFetch();
    expect(probe.resolverForm).toEqual({
      ok: false,
      status: 404,
      videoId: null,
      title: null,
      error: null,
    });
    expect(probe.plainForm.status).toBe(404);
  });
});
