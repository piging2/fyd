/**
 * PING home composition: story before services, conversation beside them.
 */
import type { FYDSiteSpec, FYDPage } from "@/fyd/sitespec/types";
import { composePingHome } from "../compose";

function section(component: string) {
  return {
    id: "home:" + component + ":0",
    component,
    query: { kind: "all", schemas: [], limit: 1 },
    presentation: {},
  };
}

function stubSpec(components: string[]): FYDSiteSpec {
  const home: FYDPage = {
    slug: "home",
    title: "Home",
    navLabel: "Home",
    sections: components.map(section),
  };
  return {
    kind: "fyd.sitespec@1",
    ownerObjectId: "owner-1",
    version: 1,
    generator: { name: "fyd-site-generator", version: "test", generatedAt: "2026-10-05T00:00:00Z" },
    themeTokens: {
      accent: "#000000", accentForeground: "#ffffff", surface: "#ffffff",
      ink: "#000000", radius: "md", fontDisplay: "serif", fontBody: "sans-serif",
    },
    navigation: [],
    pages: [home],
    provenance: { source: "website-ingestion", claimKind: "website_statement", note: "test stub" },
  };
}

describe("composePingHome", () => {
  test("story leads, services follow, Ask FYD sits beside services", () => {
    const spec = stubSpec(["Hero", "Services", "Locations", "AskFYD", "BusinessSummary", "Contact"]);
    const out = composePingHome(spec);
    const order = out.pages[0].sections.map((s) => s.component);
    expect(order).toEqual(["Hero", "BusinessSummary", "Services", "AskFYD", "Locations", "Contact"]);
  });

  test("missing components are skipped without disturbing the rest", () => {
    const spec = stubSpec(["Hero", "Services"]);
    const out = composePingHome(spec);
    expect(out.pages[0].sections.map((s) => s.component)).toEqual(["Hero", "Services"]);
  });

  test("non-home pages are untouched and the input is not mutated", () => {
    const spec = stubSpec(["Services", "Hero"]);
    spec.pages.push({ slug: "about", title: "About", navLabel: "About", sections: [section("Services"), section("Hero")] });
    const before = JSON.stringify(spec.pages[1].sections);
    const out = composePingHome(spec);
    expect(JSON.stringify(out.pages[1].sections)).toBe(before);
    expect(spec.pages[0].sections.map((s) => s.component)).toEqual(["Services", "Hero"]);
  });
});
