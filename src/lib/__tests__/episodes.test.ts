import { getPost, renderMarkdown } from "@/lib/blog";
import { buildEpisodeDepth, buildEpisodePageTitle, durationToIso8601, embedUrlFor, episodePages, episodeShortTitle, getEpisodePage } from "@/lib/episodes";
import { episodeVideos, featuredFilm } from "@/lib/longping-media";

describe("episode landing page data (B-12)", () => {
  it("lists exactly the long-form episodes in the media inventory", () => {
    expect(episodePages).toHaveLength(episodeVideos.length + 1);
    const ids = episodePages.map((e) => e.video.id).sort();
    expect(ids).toEqual([...episodeVideos.map((v) => v.id), featuredFilm.id].sort());
  });

  it("every episode has a real watch URL and a stable unique slug", () => {
    const slugs = new Set<string>();
    for (const e of episodePages) {
      expect(e.video.watchUrl).toContain("youtube.com/watch?v=");
      expect(slugs.has(e.slug)).toBe(false);
      slugs.add(e.slug);
      expect(getEpisodePage(e.slug)).toBe(e);
    }
    expect(getEpisodePage("no-such-episode")).toBeNull();
  });

  it("converts only real inventory durations to ISO 8601", () => {
    expect(durationToIso8601(featuredFilm.duration)).toBe("PT3H43M");
    expect(durationToIso8601(undefined)).toBeNull();
    expect(durationToIso8601("soon")).toBeNull();
    for (const v of episodeVideos) {
      if (v.id === "7ljMOGuKKv8") {
        // Episode 2 corrected edition: duration verified from the YouTube
        // player response (lengthSeconds 12446) in the publish record.
        expect(durationToIso8601(v.duration)).toBe("PT3H27M");
      } else {
        expect(durationToIso8601(v.duration)).toBeNull();
      }
    }
  });

  it("keeps every landing page meta description in the 147 to 160 band", () => {
    for (const e of episodePages) {
      expect(e.description.length).toBeGreaterThanOrEqual(147);
      expect(e.description.length).toBeLessThanOrEqual(160);
    }
  });

  it("resolves every episode slug to its published breakdown post", () => {
    for (const e of episodePages) {
      const post = getPost(e.slug);
      expect(post?.slug).toBe(e.slug);
      expect((post?.title ?? "").length).toBeGreaterThan(0);
      expect((post?.excerpt ?? "").length).toBeGreaterThan(0);
    }
  });

  it("derives the embed URL from the verified video id", () => {
    expect(embedUrlFor(featuredFilm)).toBe("https://www.youtube.com/embed/" + featuredFilm.id);
  });
});

describe("unified episode page titles (Wave 29, regrade defect 8)", () => {
  it("builds every episode title in the one pattern, with the layout suffix under 75 chars", () => {
    const built = episodePages.map((e) => buildEpisodePageTitle(e));
    expect(built).toEqual([
      "The Long Ping, Episode 1: What Survives 10,000 Years",
      "The Long Ping, Episode 2: The Water Wheel Problem (Chapters 1-10)",
      "The Long Ping, Episode 3: The Grid Problem",
    ]);
    for (const title of built) {
      expect(title).toMatch(/^The Long Ping, Episode [123]: .+/);
      expect((title + " · PING").length).toBeLessThan(75);
    }
  });

  it("strips either stored decoration to the short title, and leaves stored titles untouched", () => {
    expect(episodeShortTitle("The Long Ping, Episode 1: What Survives 10,000 Years")).toBe("What Survives 10,000 Years");
    expect(episodeShortTitle("The Grid Problem | The Long Ping")).toBe("The Grid Problem");
    expect(episodePages[2].video.title).toBe("The Grid Problem | The Long Ping");
  });
});

describe("episode depth sections (Wave 26, regrade defect 1)", () => {
  it("derives summary, topics and excerpt from the real post for every episode", () => {
    for (const e of episodePages) {
      const post = getPost(e.slug);
      expect(post).not.toBeNull();
      const depth = buildEpisodeDepth(post!.body);
      expect(depth).not.toBeNull();
      expect(depth!.summary.length).toBeGreaterThan(100);
      expect(post!.body).toContain(depth!.summary);
      const headings = [...post!.body.matchAll(/^##\s+(.*)$/gm)].map((m) =>
        m[1].replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").trim(),
      );
      expect(depth!.topics.map(({ label }) => label)).toEqual(headings);
      const { html } = renderMarkdown(post!.body);
      for (const topic of depth!.topics) {
        expect(html).toContain('id="' + topic.id + '"');
      }
      expect(depth!.topics.length).toBeGreaterThanOrEqual(2);
      expect(depth!.excerpt.length).toBeGreaterThan(50);
      expect(depth!.excerpt).not.toBe(depth!.summary);
    }
  });

  it("pins the actual headings of the three breakdown posts", () => {
    const expected: Record<string, string[]> = {
      "what-survives-10000-years": [
        "Watch it",
        "Read the full transcript series on Substack",
        "The short version",
      ],
      "the-water-wheel-problem": ["Watch it", "Read the series"],
      "the-grid-problem": ["Watch, listen, read", "Start with the Shorts", "Why this episode"],
    };
    for (const e of episodePages) {
      const depth = buildEpisodeDepth(getPost(e.slug)!.body);
      expect(depth!.topics.map(({ label }) => label)).toEqual(expected[e.slug]);
    }
  });

  it("strips markdown markup and skips images and lists when deriving depth", () => {
    const body = [
      "![thumb](https://example.com/x.jpg)",
      "",
      "First **real** paragraph with a [link](/blog/x) inside it, long enough to be the opening of a post.",
      "",
      "## First topic",
      "",
      "- a list item, not prose",
      "",
      "## Second topic",
      "",
      "Closing paragraph here, also long enough to stand as an excerpt from the written breakdown.",
    ].join("\n");
    const depth = buildEpisodeDepth(body);
    expect(depth).not.toBeNull();
    expect(depth!.summary).toBe(
      "First real paragraph with a link inside it, long enough to be the opening of a post.",
    );
    expect(depth!.topics.map(({ label }) => label)).toEqual(["First topic", "Second topic"]);
    expect(depth!.excerpt).toBe(
      "Closing paragraph here, also long enough to stand as an excerpt from the written breakdown.",
    );
  });

  it("uses unique shared anchors and skips headings inside code fences", () => {
    const body = [
      "Opening prose.",
      "",
      "## Same **topic**",
      "",
      "```md",
      "## Fake topic",
      "```",
      "",
      "### [Same topic](/blog/other)",
      "",
      "Closing prose.",
    ].join("\n");
    const topics = buildEpisodeDepth(body)?.topics;
    expect(topics).toEqual([
      { id: "same-topic", label: "Same topic", level: 2 },
      { id: "same-topic-2", label: "Same topic", level: 3 },
    ]);
    const { html } = renderMarkdown(body);
    expect(html).toContain('<h2 id="same-topic" tabindex="-1"');
    expect(html).toContain('<h3 id="same-topic-2" tabindex="-1"');
    expect(html).not.toContain('id="fake-topic"');
  });

  it("returns null on dangling or empty breakdown data, so pages render no depth sections", () => {
    expect(buildEpisodeDepth("")).toBeNull();
    expect(buildEpisodeDepth("![img](https://example.com/x.jpg)\n\n- only a list")).toBeNull();
    expect(buildEpisodeDepth("Prose with no headings at all, however long it runs on for.")).toBeNull();
    expect(getPost("no-such-episode")).toBeNull();
  });
});
