import { getPost } from "@/lib/blog";
import { durationToIso8601, embedUrlFor, episodePages, getEpisodePage } from "@/lib/episodes";
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
      expect(durationToIso8601(v.duration)).toBeNull();
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
