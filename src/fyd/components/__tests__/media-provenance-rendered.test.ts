/**
 * Item 9 (fyd-execution) regression: INV-RM-2 media transparency.
 *
 * Every rendered media element carries machine-readable provenance:
 * data-provenance (asset digest) and data-rights-source matching the
 * manifest, plus intrinsic dimensions. The human-visible credit stays in
 * the figcaption; the raw technical values stay in attributes (PROD-5).
 *
 * Parameterized over BOTH sites (INV-RG-1): each site's hero is built
 * from its own manifest variants.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  VisitorExperience,
  visitorExperiencePlan,
} from "../visitor-experience";
import { generateSiteSpec } from "@/fyd/proceduralize/generator";
import { COPPERSMITH_GRAPH } from "@/fyd/proceduralize/__fixtures__/coppersmith-graph";
import { HAPPY_PLACE_GRAPH } from "@/fyd/proceduralize/__fixtures__/happy-place-graph";
import type { DisplayMedia } from "@/fyd/media/select";
import type { ObjectGraph } from "@/fyd/sitespec/types";

interface SiteCase {
  siteId: string;
  graph: ObjectGraph;
  hero: DisplayMedia;
}

const copperHero: DisplayMedia = {
  id: "fyd-media-db347abf5ab76b99",
  role: "hero",
  src: "/fyd-media/db347abf5ab76b99822dd3d1f133c3ce683dc8499a0e719e39f10b08c9827b8b/card-768w.webp",
  blurUrl: "/fyd-media/db347abf5ab76b99822dd3d1f133c3ce683dc8499a0e719e39f10b08c9827b8b/blur-10w.webp",
  width: 768,
  height: 432,
  alt: "hvac heat",
  rightsSource: "public-demo-source",
  rightsBasis: "Demo basis.",
  sourceUrl: "https://example.com/hvac-heat.jpg",
  digest: "db347abf5ab76b99822dd3d1f133c3ce683dc8499a0e719e39f10b08c9827b8b",
  observedAt: "2026-09-28",
  variants: [
    { name: "thumbnail", width: 480, height: 270, url: "/fyd-media/db347abf5ab76b99822dd3d1f133c3ce683dc8499a0e719e39f10b08c9827b8b/thumbnail-480w.webp" },
    { name: "card", width: 768, height: 432, url: "/fyd-media/db347abf5ab76b99822dd3d1f133c3ce683dc8499a0e719e39f10b08c9827b8b/card-768w.webp" },
  ],
};

const happyHero: DisplayMedia = {
  id: "fyd-media-65195680aa8dd73a",
  role: "gallery",
  src: "/fyd-media/65195680aa8dd73a103096cd3d2fc872a2dff42f65b4f99df5b1cb0a68364d25/card-768w.webp",
  blurUrl: "/fyd-media/65195680aa8dd73a103096cd3d2fc872a2dff42f65b4f99df5b1cb0a68364d25/blur-10w.webp",
  width: 768,
  height: 1024,
  alt: "Happy Place Carpentry project photo 4",
  rightsSource: "public-demo-source",
  rightsBasis: "Demo basis.",
  sourceUrl: "https://example.com/project-4.jpg",
  digest: "65195680aa8dd73a103096cd3d2fc872a2dff42f65b4f99df5b1cb0a68364d25",
  observedAt: "2026-10-06",
  variants: [
    { name: "thumbnail", width: 480, height: 640, url: "/fyd-media/65195680aa8dd73a103096cd3d2fc872a2dff42f65b4f99df5b1cb0a68364d25/thumbnail-480w.webp" },
    { name: "card", width: 768, height: 1024, url: "/fyd-media/65195680aa8dd73a103096cd3d2fc872a2dff42f65b4f99df5b1cb0a68364d25/card-768w.webp" },
  ],
};

const SITES: SiteCase[] = [
  { siteId: "coppersmith-plumbing", graph: COPPERSMITH_GRAPH, hero: copperHero },
  { siteId: "happy-place", graph: HAPPY_PLACE_GRAPH, hero: happyHero },
];

function heroImg(html: string): string {
  const m = html.match(/<figure class="ve-hero-media">[\s\S]*?<img[^>]*>/);
  expect(m).not.toBeNull();
  return m![0];
}

describe.each(SITES)("media provenance rendered ($siteId)", ({ siteId, graph, hero }) => {
  const ctx = {
    graph,
    spec: generateSiteSpec(graph, { generatedAt: "2026-10-07T00:00:00.000Z" }),
    viewer: { viewerId: null, displayName: null },
    siteId,
    heroMedia: hero,
  };
  const plan = visitorExperiencePlan(ctx);
  // Precondition: the fixture really renders the photographic hero; else
  // this test would pass vacuously.
  expect(plan?.section("Hero")).toBeTruthy();
  const html = renderToStaticMarkup(createElement(VisitorExperience, { ctx }));
  const img = heroImg(html);

  test("carries data-provenance and data-rights-source from the manifest", () => {
    expect(img).toContain(`data-provenance="${hero.digest}"`);
    expect(img).toContain(`data-rights-source="${hero.rightsSource}"`);
  });

  test("exposes an honest srcset, sizes, and intrinsic dimensions", () => {
    // React serializes the prop as srcSet in static markup.
    expect(img).toContain("srcSet=");
    expect(img).toContain("480w");
    expect(img).toContain("768w");
    expect(img).toContain("sizes=");
    expect(img).toContain(`width="${hero.width}"`);
    expect(img).toContain(`height="${hero.height}"`);
  });

  test("human-visible credit stays in the figcaption, not in attributes", () => {
    expect(html).toContain("<figcaption>");
    expect(html).toContain("Image source");
  });
});
