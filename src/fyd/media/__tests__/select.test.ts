/**
 * MEDIA INTO HERO lane: hero selection rule + Hero render wiring.
 *
 * The ONE hero selection rule (heroMediaFor in ../select.ts):
 *   1. Attach the pipeline manifest to the object graph via the semantic
 *      relationships (Business represented_by Media, Service illustrated_by
 *      Media, Project has_media Media).
 *   2. Keep only acquired assets (the rights gate: reference-only assets
 *      can never surface).
 *   3. Prefer the hero-role asset; else the best other photographic
 *      asset BY COMPOSITION FITNESS (polish lane 2026-09-26): hero-slot
 *      aspect fit first, then measured mean luminance (near-black frames
 *      deprioritized), then resolution as a tiebreak. Ingest order is not
 *      a composition decision. Logos are NEVER hero candidates: a logo is
 *      brand identity, not a photographic hero.
 *   4. Null when the object has no photographic acquired media: the
 *      Hero stays typographic, never an invented image.
 *
 * The render wiring (src/fyd/components/renderer.tsx Hero): the selector
 * runs once at the server render seam and the serialized DisplayMedia is
 * threaded through RenderContext.heroMedia. The renderer never selects.
 *
 * These tests run against the REAL pipeline manifests on disk (the same
 * store the pages read), pinning the live contract for both demo sites.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { heroMediaFor, listObjectMedia, type DisplayMedia } from "../select";
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
    // LANE-8: these tests verify the hero's full provenance rendering
    // (claim pill, WhyThis drill-down), which is the engineer projection;
    // absent fails closed to the quiet visitor treatment.
    viewerKind: "engineer",
  };
}

function renderHero(heroMedia: DisplayMedia | null): string {
  return renderToStaticMarkup(renderSection(HERO_SECTION, heroCtx(heroMedia)));
}

describe("heroMediaFor selection rule (real pipeline manifests)", () => {
  test("happy-place: composition fitness selects the best photographic asset, never an invented image", async () => {
    const hero = await heroMediaFor("happy-place", testGraph(), "biz-test-1");
    expect(hero).not.toBeNull();
    expect(hero!.id.startsWith("fyd-media-")).toBe(true);
    expect(hero!.role).not.toBe("logo");
    expect(hero!.rightsSource).toBe("public-demo-source");
    // FYD-served derivative, never a hotlink.
    expect(hero!.src.startsWith("/fyd-media/")).toBe(true);
    expect(hero!.src.startsWith("http")).toBe(false);
    // Composition fitness, not ingest order: the manifest's five assets
    // are all 768x1024 portraits, so the measured-brightest frame wins
    // (the old ingest-order pick was the dark pipe frame the 2026-09-26
    // falsifier caught in the banner).
    expect(hero!.id).toBe("fyd-media-93a3c6b3011dcc76");
  });

  test("coppersmith-plumbing: the hero-role asset wins", async () => {
    const hero = await heroMediaFor("coppersmith-plumbing", testGraph(), "biz-test-1");
    expect(hero).not.toBeNull();
    expect(hero!.id).toBe("fyd-media-db347abf5ab76b99");
    expect(hero!.role).toBe("hero");
    expect(hero!.src.startsWith("/fyd-media/")).toBe(true);
    expect(hero!.alt.trim().length).toBeGreaterThan(0);
    // FYD-served derivative, never a hotlink.
    expect(hero!.src.startsWith("http")).toBe(false);
  });

  test("selection is deterministic: same inputs, same result", async () => {
    const graph = testGraph();
    const a = await heroMediaFor("coppersmith-plumbing", graph, "biz-test-1");
    const b = await heroMediaFor("coppersmith-plumbing", graph, "biz-test-1");
    expect(a).toEqual(b);
  });

  test("unknown site selects null (missing data is not a failure)", async () => {
    expect(await heroMediaFor("no-such-site", testGraph(), "biz-test-1")).toBeNull();
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
    expect(html).toContain("Site record");
  });

  test("Hero with media keeps the identity block", () => {
    const html = renderHero(media);
    expect(html).toContain("Site record");
    expect(html).toContain("Ask FYD");
  });
});

// ---------------------------------------------------------------------------
// Fixture-manifest tests: the logo/hero rule and the Why this? affordance.
// These write a temporary manifest into the production manifests dir and
// remove it in a finally block, so the REAL read path (fresh-from-disk +
// production-truth validation) is exercised end to end.
// ---------------------------------------------------------------------------

const FIXTURE_SITE = "__test-hero-logo";

function fixtureMedia(id: string, roles: string[]): any {
  return {
    id,
    schema: "ping.social.media@1",
    title: "Fixture " + id,
    mediaType: "image",
    roles,
    rightsSource: "public-demo-source",
    rightsBasis: "fixture rights basis",
    lifecycle: "published",
    provenance: {
      sourceUrl: "https://example.com/" + id + ".jpg",
      sourcePage: "https://example.com/",
      observedAt: TS,
    },
    digest: "f".repeat(64),
    originalFormat: "jpeg",
    width: 1200,
    height: 800,
    variants: [
      {
        name: "thumbnail",
        width: 400,
        height: 267,
        format: "webp",
        url: "/fyd-media/fixture/" + id + "/thumbnail-400w.webp",
        bytes: 1000,
        digest: "f".repeat(64),
        derivedFrom: "f".repeat(64),
      },
    ],
    depicts: [],
    altText: "Alt " + id,
    altTextSource: "source",
    visibility: "public",
  };
}

/** Run fn with a fixture manifest on disk; the file is always removed. */
function withFixtureManifest(media: any[], fn: () => void): void {
  const manifest = {
    siteId: FIXTURE_SITE,
    generatedAt: TS,
    generator: "fyd-media@2",
    ingestRunId: "test-ingest-run",
    pipelineVersion: "fyd-media@2",
    observations: [],
    media,
  };
  const path = join(
    process.cwd(),
    "src",
    "fyd",
    "media",
    "manifests",
    FIXTURE_SITE + ".json",
  );
  writeFileSync(path, JSON.stringify(manifest));
  try {
    fn();
  } finally {
    unlinkSync(path);
  }
}

/** Async variant: the selector under test is async (luminance via sharp). */
async function withFixtureManifestAsync(
  media: any[],
  fn: () => Promise<void>,
): Promise<void> {
  const manifest = {
    siteId: FIXTURE_SITE,
    generatedAt: TS,
    generator: "fyd-media@2",
    ingestRunId: "test-ingest-run",
    pipelineVersion: "fyd-media@2",
    observations: [],
    media,
  };
  const path = join(
    process.cwd(),
    "src",
    "fyd",
    "media",
    "manifests",
    FIXTURE_SITE + ".json",
  );
  writeFileSync(path, JSON.stringify(manifest));
  try {
    await fn();
  } finally {
    unlinkSync(path);
  }
}

/**
 * Fitness fixture: a photographic asset whose display variant has the
 * given dimensions, with an optional blur variant at the given
 * same-origin URL (the luminance probe reads the file under /public).
 */
function fitnessMedia(
  id: string,
  width: number,
  height: number,
  blurUrl: string | null,
): any {
  const variants: any[] = [
    {
      name: "thumbnail",
      width,
      height,
      format: "webp",
      url: "/fyd-media/fixture/" + id + "/thumbnail.webp",
      bytes: 1000,
      digest: "f".repeat(64),
      derivedFrom: "f".repeat(64),
    },
  ];
  if (blurUrl) {
    variants.push({
      name: "blur10",
      width: 10,
      height: 10,
      format: "png",
      url: blurUrl,
      bytes: 100,
      digest: "b".repeat(64),
      derivedFrom: "f".repeat(64),
    });
  }
  return {
    id,
    schema: "ping.social.media@1",
    title: "Fixture " + id,
    mediaType: "image",
    roles: ["gallery"],
    rightsSource: "public-demo-source",
    rightsBasis: "fixture rights basis",
    lifecycle: "published",
    provenance: {
      sourceUrl: "https://example.com/" + id + ".jpg",
      sourcePage: "https://example.com/",
      observedAt: TS,
    },
    digest: "f".repeat(64),
    originalFormat: "jpeg",
    width,
    height,
    variants,
    depicts: [],
    altText: "Alt " + id,
    altTextSource: "source",
    visibility: "public",
  };
}

describe("heroMediaFor never returns a logo-role asset", () => {
  test("logo-only object: null, the caller renders its typographic hero", async () => {
    await withFixtureManifestAsync([fixtureMedia("m-logo", ["logo"])], async () => {
      expect(await heroMediaFor(FIXTURE_SITE, testGraph(), "biz-test-1")).toBeNull();
    });
  });

  test("hero + logo: the hero-role asset wins", async () => {
    await withFixtureManifestAsync(
      [
        fixtureMedia("m-logo", ["logo"]),
        fixtureMedia("m-hero", ["hero", "gallery"]),
      ],
      async () => {
        const hero = await heroMediaFor(FIXTURE_SITE, testGraph(), "biz-test-1");
        expect(hero).not.toBeNull();
        expect(hero!.id).toBe("m-hero");
        expect(hero!.role).toBe("hero");
      },
    );
  });

  test("gallery + logo (no hero): the gallery asset wins, never the logo", async () => {
    await withFixtureManifestAsync(
      [fixtureMedia("m-logo", ["logo"]), fixtureMedia("m-gallery", ["gallery"])],
      async () => {
        // The sort still leads with the logo: the old code would return it.
        const hero = await heroMediaFor(FIXTURE_SITE, testGraph(), "biz-test-1");
        expect(hero).not.toBeNull();
        expect(hero!.id).toBe("m-gallery");
        expect(hero!.role).not.toBe("logo");
      },
    );
  });

  test("listObjectMedia (galleries/object view) intentionally still leads with the logo", () => {
    withFixtureManifest(
      [fixtureMedia("m-gallery", ["gallery"]), fixtureMedia("m-logo", ["logo"])],
      () => {
        const all = listObjectMedia(FIXTURE_SITE, testGraph(), "biz-test-1");
        expect(all.map((d) => d.id)).toEqual(["m-logo", "m-gallery"]);
      },
    );
  });
});

// ---------------------------------------------------------------------------
// Polish lane (2026-09-26): fallback hero composition-fitness ranking.
// No hero-role asset: the selector ranks by measurable fitness (16/9
// aspect fit, measured mean luminance, resolution tiebreak) instead of
// ingest order.
// ---------------------------------------------------------------------------

describe("fallback hero composition-fitness ranking", () => {
  test("prefers 16:9 landscape over portrait regardless of ingest order", async () => {
    await withFixtureManifestAsync(
      [
        // Portrait listed first: ingest order must not win.
        fitnessMedia("m-portrait", 600, 800, null),
        fitnessMedia("m-landscape", 1600, 900, null),
      ],
      async () => {
        const hero = await heroMediaFor(FIXTURE_SITE, testGraph(), "biz-test-1");
        expect(hero).not.toBeNull();
        expect(hero!.id).toBe("m-landscape");
      },
    );
  });

  test("resolution breaks ties when aspect and luminance are equal", async () => {
    await withFixtureManifestAsync(
      [
        fitnessMedia("m-small", 1600, 900, null),
        fitnessMedia("m-large", 2400, 1350, null),
      ],
      async () => {
        const hero = await heroMediaFor(FIXTURE_SITE, testGraph(), "biz-test-1");
        expect(hero).not.toBeNull();
        expect(hero!.id).toBe("m-large");
      },
    );
  });

  test("deprioritizes near-black frames with equal aspect and resolution", async () => {
    // Real 10px blur files under /public: the luminance probe measures
    // actual bytes (sharp), not manifest claims.
    const dir = join(process.cwd(), "public", "fyd-media", "__test-fitness");
    mkdirSync(dir, { recursive: true });
    const darkPath = join(dir, "black.png");
    const brightPath = join(dir, "bright.png");
    await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 2, g: 2, b: 2 } },
    })
      .png()
      .toFile(darkPath);
    await sharp({
      create: { width: 10, height: 10, channels: 3, background: { r: 200, g: 200, b: 200 } },
    })
      .png()
      .toFile(brightPath);
    try {
      await withFixtureManifestAsync(
        [
          // Near-black listed first: fitness must outrank ingest order.
          fitnessMedia("m-dark", 1600, 900, "/fyd-media/__test-fitness/black.png"),
          fitnessMedia("m-bright", 1600, 900, "/fyd-media/__test-fitness/bright.png"),
        ],
        async () => {
          const hero = await heroMediaFor(FIXTURE_SITE, testGraph(), "biz-test-1");
          expect(hero).not.toBeNull();
          expect(hero!.id).toBe("m-bright");
        },
      );
    } finally {
      unlinkSync(darkPath);
      unlinkSync(brightPath);
    }
  });

  test("unreadable blurs degrade to aspect+resolution ranking, never failure", async () => {
    await withFixtureManifestAsync(
      [
        fitnessMedia("m-ghost", 1600, 900, "/fyd-media/__test-fitness/missing.png"),
        fitnessMedia("m-real", 2400, 1350, null),
      ],
      async () => {
        const hero = await heroMediaFor(FIXTURE_SITE, testGraph(), "biz-test-1");
        expect(hero).not.toBeNull();
        // m-real wins on resolution; m-ghost's missing blur must not
        // throw or poison the ranking.
        expect(hero!.id).toBe("m-real");
      },
    );
  });

  test("fitness ranking is deterministic across runs", async () => {
    await withFixtureManifestAsync(
      [
        fitnessMedia("m-a", 600, 800, null),
        fitnessMedia("m-b", 1600, 900, null),
        fitnessMedia("m-c", 1200, 900, null),
      ],
      async () => {
        const a = await heroMediaFor(FIXTURE_SITE, testGraph(), "biz-test-1");
        const b = await heroMediaFor(FIXTURE_SITE, testGraph(), "biz-test-1");
        expect(a?.id).toBe("m-b");
        expect(b?.id).toBe("m-b");
      },
    );
  });
});

describe("Hero Why this? affordance", () => {
  const whyMedia: DisplayMedia = {
    id: "fyd-media-why",
    role: "hero",
    src: "/fyd-media/abc123/card-768w.webp",
    blurUrl: null,
    width: 768,
    height: 432,
    alt: "Why hero image",
    rightsSource: "public-demo-source",
    rightsBasis: "Public marketing imagery on the business site.",
    sourceUrl: "https://example.com/why.jpg",
    digest: "abc123def456",
    observedAt: TS,
  };

  test("Hero with media surfaces a contextual Why this? with provenance only", () => {
    const html = renderHero(whyMedia);
    expect(html).toContain("Why this?");
    // Provenance fields flow through; nothing is invented.
    expect(html).toContain("https://example.com/why.jpg");
    expect(html).toContain("Public marketing imagery on the business site.");
  });

  test("Hero without media has no Why this? affordance", () => {
    expect(renderHero(null)).not.toContain("Why this?");
  });
});
