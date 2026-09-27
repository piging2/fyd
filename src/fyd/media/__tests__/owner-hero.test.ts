/**
 * Owner-selected hero override (lane-media).
 *
 * Binding: deterministic hero selection with the business owner's
 * selection outranking the automatic selection. The override is
 * validated, not trusted: a stale/mistyped/revoked/rights-rejected
 * owner selection falls back to auto with a diagnostic note.
 *
 * Fixture manifests are written into the production manifests dir and
 * removed in a finally block (the select.test.ts pattern), so the real
 * read path (fresh-from-disk + production-truth validation) is
 * exercised.
 */

import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { resolveHeroMedia } from "../owner-hero";
import { heroMediaFor } from "../select";
import type { ObjectGraph } from "../../sitespec/types";
import type { PingObject } from "@/lib/ping/types";

const TS = "2026-09-21T00:00:00.000Z";
const FIXTURE_SITE = "__test-owner-hero";

function businessObject(id: string): PingObject {
  return {
    id,
    schema: "ping.social.business@1",
    controllerId: "web:" + id,
    visibility: "public",
    title: "Test Business",
    description: "A test business for owner-hero override.",
    fields: {},
    createdAt: TS,
    updatedAt: TS,
    provenance: { kind: "website-derived", ref: "test", derivedAt: TS },
  };
}

function testGraph(): ObjectGraph {
  return { objects: [businessObject("biz-test-1")], relationships: [] };
}

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
    digest: "e".repeat(64),
    originalFormat: "jpeg",
    width: 1200,
    height: 800,
    variants: [
      {
        name: "hero",
        width: 1200,
        height: 800,
        format: "webp",
        url: "/fyd-media/fixture/" + id + "/hero-1200w.webp",
        bytes: 5000,
        digest: "e".repeat(64),
        derivedFrom: "e".repeat(64),
      },
      {
        name: "thumbnail",
        width: 400,
        height: 267,
        format: "webp",
        url: "/fyd-media/fixture/" + id + "/thumbnail-400w.webp",
        bytes: 1000,
        digest: "e".repeat(64),
        derivedFrom: "e".repeat(64),
      },
    ],
    depicts: [],
    altText: "Alt " + id,
    altTextSource: "source",
    visibility: "public",
  };
}

function fixtureManifestPath(): string {
  return join(
    process.cwd(),
    "src",
    "fyd",
    "media",
    "manifests",
    FIXTURE_SITE + ".json",
  );
}

function withFixtureManifest(media: any[], fn: () => void): void {
  const manifest = {
    siteId: FIXTURE_SITE,
    generatedAt: TS,
    generator: "fyd-media@2",
    ingestRunId: "test-ingest-run-owner-hero",
    pipelineVersion: "fyd-media@2",
    observations: [],
    media,
  };
  const path = fixtureManifestPath();
  writeFileSync(path, JSON.stringify(manifest));
  try {
    fn();
  } finally {
    unlinkSync(path);
  }
}

/**
 * Async variant: resolveHeroMedia (and the selector under it) is async
 * (luminance via sharp). The sync wrapper cannot await the inner work,
 * so async tests must use this.
 */
async function withFixtureManifestAsync(
  media: any[],
  fn: () => Promise<void>,
): Promise<void> {
  const manifest = {
    siteId: FIXTURE_SITE,
    generatedAt: TS,
    generator: "fyd-media@2",
    ingestRunId: "test-ingest-run-owner-hero",
    pipelineVersion: "fyd-media@2",
    observations: [],
    media,
  };
  const path = fixtureManifestPath();
  writeFileSync(path, JSON.stringify(manifest));
  try {
    await fn();
  } finally {
    unlinkSync(path);
  }
}

const FULL = [fixtureMedia("m-hero", ["hero", "gallery"]), fixtureMedia("m-gallery", ["gallery"]), fixtureMedia("m-logo", ["logo"])];

describe("resolveHeroMedia", () => {
  test("no owner id: basis auto, identical to the automatic selector", async () => {
    await withFixtureManifestAsync(FULL, async () => {
      const graph = testGraph();
      const r = await resolveHeroMedia(FIXTURE_SITE, graph, "biz-test-1", null);
      expect(r.basis).toBe("auto");
      expect(r.ownerSelectedId).toBeNull();
      expect(r.media).toEqual(await heroMediaFor(FIXTURE_SITE, graph, "biz-test-1"));
      expect(r.note.length).toBeGreaterThan(0);
    });
  });

  test("owner picks a gallery asset: the owner's pick outranks auto", async () => {
    await withFixtureManifestAsync(FULL, async () => {
      // Auto would pick m-hero (hero-role); the owner picks m-gallery.
      const r = await resolveHeroMedia(FIXTURE_SITE, testGraph(), "biz-test-1", "m-gallery");
      expect(r.basis).toBe("owner");
      expect(r.ownerSelectedId).toBe("m-gallery");
      expect(r.media).not.toBeNull();
      expect(r.media!.id).toBe("m-gallery");
      expect(r.media!.src.startsWith("/fyd-media/")).toBe(true);
    });
  });

  test("owner picks the hero asset: basis owner", async () => {
    await withFixtureManifestAsync(FULL, async () => {
      const r = await resolveHeroMedia(FIXTURE_SITE, testGraph(), "biz-test-1", "m-hero");
      expect(r.basis).toBe("owner");
      expect(r.media!.id).toBe("m-hero");
    });
  });

  test("owner picks a logo: fallback to auto, never a logo hero", async () => {
    await withFixtureManifestAsync(FULL, async () => {
      const r = await resolveHeroMedia(FIXTURE_SITE, testGraph(), "biz-test-1", "m-logo");
      expect(r.basis).toBe("owner-fallback");
      expect(r.ownerSelectedId).toBe("m-logo");
      expect(r.media).not.toBeNull();
      expect(r.media!.role).not.toBe("logo");
      expect(r.note).toContain("logo");
    });
  });

  test("stale owner id: fallback to auto with a diagnostic note", async () => {
    await withFixtureManifestAsync(FULL, async () => {
      const r = await resolveHeroMedia(FIXTURE_SITE, testGraph(), "biz-test-1", "fyd-media-deadbeefdeadbeef");
      expect(r.basis).toBe("owner-fallback");
      expect(r.media).toEqual(await heroMediaFor(FIXTURE_SITE, testGraph(), "biz-test-1"));
      expect(r.note).toContain("could not be honored");
    });
  });

  test("unknown site with owner id: null media, owner-fallback", async () => {
    const r = await resolveHeroMedia("no-such-site", testGraph(), "biz-test-1", "m-hero");
    expect(r.basis).toBe("owner-fallback");
    expect(r.media).toBeNull();
  });

  test("logo-only site: owner picks the logo -> null media, owner-fallback", async () => {
    await withFixtureManifestAsync([fixtureMedia("m-logo", ["logo"])], async () => {
      const r = await resolveHeroMedia(FIXTURE_SITE, testGraph(), "biz-test-1", "m-logo");
      expect(r.basis).toBe("owner-fallback");
      expect(r.media).toBeNull();
    });
  });

  test("deterministic: same inputs, same resolution", async () => {
    await withFixtureManifestAsync(FULL, async () => {
      const graph = testGraph();
      const a = await resolveHeroMedia(FIXTURE_SITE, graph, "biz-test-1", "m-gallery");
      const b = await resolveHeroMedia(FIXTURE_SITE, graph, "biz-test-1", "m-gallery");
      expect(a).toEqual(b);
    });
  });
});
