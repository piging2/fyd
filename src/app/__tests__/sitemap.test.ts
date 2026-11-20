/**
 * W-30: the sitemap's lastModified carries only real per-page dates.
 * Blog entries keep their post date; episode entries carry the
 * verified upload date when the inventory has one; every other entry
 * omits the field, so no two entries share a build-stamped timestamp.
 */
import sitemap from "../sitemap";
import { getAllPosts } from "@/lib/blog";
import { episodePages } from "@/lib/episodes";

describe("sitemap lastModified discipline", () => {
  const entries = sitemap();
  const byUrl = new Map(entries.map((e) => [e.url, e]));

  it("blog entries carry exactly their post date", () => {
    for (const post of getAllPosts()) {
      const entry = [...byUrl.values()].find((e) =>
        e.url.endsWith("/blog/" + post.slug),
      );
      expect(entry).toBeDefined();
      expect(entry!.lastModified).toBeDefined();
      const d = new Date(entry!.lastModified as Date);
      expect(d.toISOString().slice(0, 10)).toBe(post.date);
    }
  });

  it("episode entries carry the verified upload date when present", () => {
    for (const ep of episodePages) {
      const entry = [...byUrl.values()].find((e) =>
        e.url.endsWith("/episodes/" + ep.slug),
      );
      expect(entry).toBeDefined();
      if (ep.video.uploadDate) {
        expect(entry!.lastModified).toBeDefined();
        expect(new Date(entry!.lastModified as Date).toISOString()).toBe(
          new Date(ep.video.uploadDate).toISOString(),
        );
      } else {
        expect(entry!.lastModified).toBeUndefined();
      }
    }
  });

  it("no non-blog, non-episode entry carries a lastModified", () => {
    const dated = entries.filter(
      (e) =>
        e.lastModified !== undefined &&
        !e.url.includes("/blog/") &&
        !e.url.includes("/episodes/"),
    );
    expect(dated).toEqual([]);
  });

  it("the dated set is stable across calls (no request-time stamp)", () => {
    const stampsOf = (list: typeof entries) =>
      list
        .filter((e) => e.lastModified !== undefined)
        .map((e) => e.url + "@" + new Date(e.lastModified as Date).toISOString())
        .sort();
    expect(stampsOf(sitemap())).toEqual(stampsOf(entries));
  });
});
