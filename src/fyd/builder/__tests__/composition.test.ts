/**
 * Composition transform: pure section variants from measured signals.
 *
 * composeSections never invents sections and never changes facts; it
 * annotates presentation.compositionVariant and drops Gallery sections
 * below the asset minimum. Synthetic sections only.
 */
import { composeSections, MIN_GALLERY_ASSETS } from "../composition";
import { signalsForGraph, type GraphSignals } from "../signals";
import { tradeGraph } from "./fixtures";
import type { FYDPage, FYDQuery, FYDSection } from "../../sitespec/types";

function section(id: string, component: string, query: FYDQuery): FYDSection {
  return { id, component, query, presentation: {} };
}

function page(slug: string, sections: FYDSection[]): FYDPage {
  return { slug, navLabel: slug, sections };
}

const SVC_QUERY: FYDQuery = { kind: "all", schema: "ping.social.service@1" };
const POST_QUERY: FYDQuery = { kind: "all", schema: "ping.social.post@1" };
const GALLERY_QUERY: FYDQuery = { kind: "static" };

function signalsWithAssets(assets: number): GraphSignals {
  return signalsForGraph(tradeGraph(), {
    galleryAssets: assets,
    heroAsset: false,
    photographicObjectIds: [],
  });
}

describe("composeSections", () => {
  test("Services: <= 4 bound -> grid, >= 5 -> rows", () => {
    const mk = (count: number) =>
      composeSections(
        [page("home", [section("s1", "Services", SVC_QUERY)])],
        signalsWithAssets(0),
        () => ({ count, photoObjectIds: [] as string[] }),
      );
    expect(mk(2).pages[0].sections[0].presentation.compositionVariant).toBe("grid");
    expect(mk(4).pages[0].sections[0].presentation.compositionVariant).toBe("grid");
    expect(mk(5).pages[0].sections[0].presentation.compositionVariant).toBe("rows");
    expect(mk(12).pages[0].sections[0].presentation.compositionVariant).toBe("rows");
  });

  test("Services: one headline offering with photography -> feature", () => {
    const out = composeSections(
      [page("home", [section("s1", "Services", SVC_QUERY)])],
      signalsWithAssets(0),
      () => ({ count: 1, photoObjectIds: ["svc-drains"] }),
    );
    expect(out.pages[0].sections[0].presentation.compositionVariant).toBe("feature");
  });

  test("Services: one offering without media stays grid", () => {
    const out = composeSections(
      [page("home", [section("s1", "Services", SVC_QUERY)])],
      signalsWithAssets(0),
      () => ({ count: 1, photoObjectIds: [] }),
    );
    expect(out.pages[0].sections[0].presentation.compositionVariant).toBe("grid");
  });

  test("Posts family: list / grid / archive by bound count", () => {
    const mk = (component: string, count: number) =>
      composeSections(
        [page("home", [section("p1", component, POST_QUERY)])],
        signalsWithAssets(0),
        () => ({ count, photoObjectIds: [] as string[] }),
      ).pages[0].sections[0].presentation.compositionVariant;
    for (const component of ["Posts", "RecentObjects", "ObjectFeed"]) {
      expect(mk(component, 3)).toBe("list");
      expect(mk(component, 8)).toBe("grid");
      expect(mk(component, 15)).toBe("archive");
    }
  });

  test("Gallery below the asset minimum is dropped, with a note", () => {
    const out = composeSections(
      [page("home", [section("g1", "Gallery", GALLERY_QUERY)])],
      signalsWithAssets(MIN_GALLERY_ASSETS - 1),
      () => ({ count: 0, photoObjectIds: [] as string[] }),
    );
    expect(out.pages[0].sections).toEqual([]);
    expect(out.notes.some((n) => n.includes("below the 3 minimum"))).toBe(true);
  });

  test("Gallery: grid at 3..11 assets, masonry at >= 12", () => {
    const mk = (assets: number) =>
      composeSections(
        [page("home", [section("g1", "Gallery", GALLERY_QUERY)])],
        signalsWithAssets(assets),
        () => ({ count: 0, photoObjectIds: [] as string[] }),
      ).pages[0].sections[0].presentation.compositionVariant;
    expect(mk(3)).toBe("grid");
    expect(mk(11)).toBe("grid");
    expect(mk(12)).toBe("masonry");
  });

  test("variant assignments are recorded in notes", () => {
    const out = composeSections(
      [page("home", [section("s1", "Services", SVC_QUERY)])],
      signalsWithAssets(0),
      () => ({ count: 7, photoObjectIds: [] as string[] }),
    );
    expect(out.notes.some((n) => n.includes('"rows"') && n.includes("7 bound services"))).toBe(true);
  });

  test("the transform is pure: input pages are never mutated", () => {
    const pages = [
      page("home", [
        section("s1", "Services", SVC_QUERY),
        section("g1", "Gallery", GALLERY_QUERY),
      ]),
    ];
    const before = JSON.stringify(pages);
    composeSections(pages, signalsWithAssets(0), () => ({
      count: 2,
      photoObjectIds: [] as string[],
    }));
    expect(JSON.stringify(pages)).toBe(before);
  });

  test("same inputs -> byte-identical output", () => {
    const run = () =>
      JSON.stringify(
        composeSections(
          [page("home", [section("s1", "Services", SVC_QUERY)])],
          signalsWithAssets(4),
          () => ({ count: 2, photoObjectIds: [] as string[] }),
        ),
      );
    expect(run()).toBe(run());
  });

  test("non-composed components pass through untouched", () => {
    const hero = section("h1", "Hero", { kind: "owner" });
    const out = composeSections([page("home", [hero])], signalsWithAssets(0), () => ({
      count: 0,
      photoObjectIds: [] as string[],
    }));
    expect(out.pages[0].sections[0].presentation.compositionVariant).toBeUndefined();
    expect(out.notes).toEqual([]);
  });
});
