import { ESSAY_LINKS_BY_TECH_PAGE, getEssaySlugsForTechPage } from "../essay-links";
import { getAllPosts } from "../blog";

/**
 * Wave 18 (B-10): the reverse internal link mapping must never dangle.
 * Every slug listed for a technology page has to resolve to a real
 * published post, every key has to be a real technology subpage, and
 * the deliberately unmapped page stays unmapped.
 */
const TECH_SLUGS = [
  "agents",
  "business-automation",
  "continuity",
  "events",
  "evidence",
  "integrations",
  "replay",
  "social-objects",
  "tenantos",
];

describe("essay-links mapping", () => {
  it("resolves every mapped slug to a real published post", () => {
    const published = new Set(getAllPosts().map((p) => p.slug));
    for (const [page, slugs] of Object.entries(ESSAY_LINKS_BY_TECH_PAGE)) {
      for (const slug of slugs) {
        expect({ page, slug, resolves: published.has(slug) }).toEqual({
          page,
          slug,
          resolves: true,
        });
      }
    }
  });

  it("keys are real technology subpages, with no duplicates per page", () => {
    for (const [page, slugs] of Object.entries(ESSAY_LINKS_BY_TECH_PAGE)) {
      expect(TECH_SLUGS).toContain(page);
      expect(new Set(slugs).size).toBe(slugs.length);
      expect(slugs.length).toBeGreaterThanOrEqual(1);
      expect(slugs.length).toBeLessThanOrEqual(3);
    }
  });

  it("maps eight pages and leaves social-objects out on purpose", () => {
    expect(Object.keys(ESSAY_LINKS_BY_TECH_PAGE).sort()).toEqual(
      TECH_SLUGS.filter((s) => s !== "social-objects").sort(),
    );
    expect(getEssaySlugsForTechPage("social-objects")).toEqual([]);
    expect(getEssaySlugsForTechPage("no-such-page")).toEqual([]);
  });

  it("gives tenantos exactly its one genuine essay, not a forced second", () => {
    expect(getEssaySlugsForTechPage("tenantos")).toEqual(["hpp-to-ping-first-tenant"]);
  });
});
