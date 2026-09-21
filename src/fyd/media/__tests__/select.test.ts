/**
 * MEDIA INTO HERO lane: hero selection rule + Hero render wiring.
 *
 * The ONE hero selection rule (heroMediaFor in ../select.ts):
 *   1. Attach the pipeline manifest to the object graph via the semantic
 *      relationships (Business represented_by Media, Service illustrated_by
 *      Media, Project has_media Media).
 *   2. Keep only acquired assets (the rights gate: reference-only assets
 *      can never surface).
 *   3. Prefer the hero-role asset; else the first in stable
 *      (logo, hero, gallery, id) order.
 *   4. Null when the object has no acquired media: the Hero stays
 *      typographic, never an invented image.
 *
 * The render wiring (src/fyd/components/renderer.tsx Hero): the selector
 * runs once at the server render seam and the serialized DisplayMedia is
 * threaded through RenderContext.heroMedia. The renderer never selects.
 *
 * These tests run against the REAL pipeline manifests on disk (the same
 * store the pages read), pinning the live contract for both demo sites.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { heroMediaFor, type DisplayMedia } from "../select";
import { renderSection, type RenderContext } from "../../components/renderer";
import {
  DEFAULT_FYD_THEME,
  type FYDSection,
  type FYDSiteSpec,
  type ObjectGraph,
} from "../../sitespec/types";
import type { PingObject } from "@/lib/ping/types";

const TS = "2026-09-21T00:00:00.000Z";

function businessObject(id: string): PingObject {
  return {
    id,
    schema: "ping.social.business@1",
    controllerId: "web:" + id,
    visibility: "public",
    title: "Test Business",
    description: "A test business for hero wiring.",
    fields: {},
    createdAt: TS,
    updatedAt: TS,
    provenance: { kind: "website-derived", ref: "test", derivedAt: TS },
  };
}

function testGraph(): ObjectGraph {
  return { objects: [businessObject("biz-test-1")], relationships: [] };
}

function testSpec(ownerId: string): FYDSiteSpec {
  return {
    kind: "fyd.sitespec@1",
    ownerObjectId: ownerId,
    version: 1,
    generator: { name: "fyd-site-generator", version: "test", generatedAt: TS },
    themeTokens: DEFAULT_FYD_THEME,
    navigation: [],
    pages: [],
    provenance: {
      source: "website-ingestion",
      claimKind: "website_statement",
      note: "test",
    },
  };
}

const HERO_SECTION: FYDSection = {
  id: "home:Hero:0",
  component: "Hero",
  query: { kind: "owner" },
  presentation: {},
};

function heroCtx(heroMedia: DisplayMedia | null): RenderContext {
  return {
    spec: testSpec("biz-test-1"),
    graph: testGraph(),
    viewer: { viewerId: null, displayName: null },
    siteId: "test-site",
    heroMedia,
  };
}

function renderHero(heroMedia: DisplayMedia | null): string {
  return renderToStaticMarkup(renderSection(HERO_SECTION, heroCtx(heroMedia)));
}

describe("heroMediaFor selection rule (real pipeline manifests)", () => {
  test("happy-place: zero acquired media selects null, never an invented image", () => {
    expect(heroMediaFor("happy-place", testGraph(), "biz-test-1")).toBeNull();
  });

  test("coppersmith-plumbing: the hero-role asset wins", () => {
    const hero = heroMediaFor("coppersmith-plumbing", testGraph(), "biz-test-1");
    expect(hero).not.toBeNull();
    expect(hero!.id).toBe("fyd-media-db347abf5ab76b99");
    expect(hero!.role).toBe("hero");
    expect(hero!.src.startsWith("/fyd-media/")).toBe(true);
    expect(hero!.alt.trim().length).toBeGreaterThan(0);
    // FYD-served derivative, never a hotlink.
    expect(hero!.src.startsWith("http")).toBe(false);
  });

  test("selection is deterministic: same inputs, same result", () => {
    const graph = testGraph();
    const a = heroMediaFor("coppersmith-plumbing", graph, "biz-test-1");
    const b = heroMediaFor("coppersmith-plumbing", graph, "biz-test-1");
    expect(a).toEqual(b);
  });

  test("unknown site selects null (missing data is not a failure)", () => {
    expect(heroMediaFor("no-such-site", testGraph(), "biz-test-1")).toBeNull();
  });
});

describe("Hero render wiring (generic component contract)", () => {
  const media: DisplayMedia = {
    id: "fyd-media-test-hero",
    role: "hero",
    src: "/fyd-media/abc123/card-768w.webp",
    blurUrl: "/fyd-media/abc123/blur-10w.webp",
    width: 768,
    height: 432,
    alt: "Test hero image",
    rightsSource: "public-demo-source",
    rightsBasis: "test basis",
    sourceUrl: "https://example.com/photo.jpg",
    digest: "abc123",
    observedAt: TS,
  };

  test("Hero renders the threaded image with honest alt text", () => {
    const html = renderHero(media);
    expect(html).toContain('data-hero-media="fyd-media-test-hero"');
    expect(html).toContain('src="/fyd-media/abc123/card-768w.webp"');
    expect(html).toContain('alt="Test hero image"');
    expect(html).toContain('width="768"');
    expect(html).toContain('height="432"');
  });

  test("Hero without media stays typographic: no img, no invented image", () => {
    const html = renderHero(null);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("fyd-media");
    expect(html).not.toContain("data-hero-media");
    // The identity block still renders.
    expect(html).toContain("Website statement");
  });

  test("Hero with media keeps the identity block", () => {
    const html = renderHero(media);
    expect(html).toContain("Website statement");
    expect(html).toContain("Ask FYD");
  });
});
