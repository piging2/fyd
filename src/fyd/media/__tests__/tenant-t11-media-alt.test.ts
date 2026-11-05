/**
 * tenant-t11-media-alt.test.ts — pins Website UI audit 2026-11-01
 * finding T11 (already satisfied on main; regression pin only).
 *
 * The finding feared images shipping with empty alt because the
 * audit's tree passed alt={m.alt ?? ""}. On current main the
 * contract is stronger: the renderer NEVER selects media itself —
 * every tenant image arrives as a DisplayMedia built once by
 * select.ts, whose alt is (altText trimmed) || title ||
 * "Business photo" — never empty — and every renderer call site
 * passes DisplayMedia.alt through unchanged.
 *
 * This pin exercises the real read path (fixture manifest on disk,
 * listObjectMedia) for each step of the fallback chain.
 */
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { listObjectMedia } from "../select";
import type { ObjectGraph } from "../../sitespec/types";
import type { PingObject } from "@/lib/ping/types";

const TS = "2026-09-21T00:00:00.000Z";
const FIXTURE_SITE = "__test-t11-alt";

function businessObject(id: string): PingObject {
  return {
    id,
    schema: "ping.social.business@1",
    controllerId: "web:" + id,
    visibility: "public",
    title: "Test Business",
    description: "A test business.",
    fields: {},
    createdAt: TS,
    updatedAt: TS,
    provenance: { kind: "website-derived", ref: "test", derivedAt: TS },
  } as PingObject;
}

function fixtureMedia(id: string, title: string, altText: string | null): any {
  return {
    id,
    schema: "ping.social.media@1",
    title,
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
    width: 1200,
    height: 800,
    variants: [
      {
        name: "web",
        width: 800,
        height: 533,
        format: "webp",
        url: "/fyd-media/fixture/" + id + "/web-800w.webp",
        bytes: 1000,
        digest: "f".repeat(64),
        derivedFrom: "f".repeat(64),
      },
    ],
    depicts: [],
    altText,
    altTextSource: altText ? "source" : "none",
    visibility: "public",
  };
}

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

const graph = (): ObjectGraph => ({
  objects: [businessObject("biz-t11")],
  relationships: [],
});

describe("tenant audit T11: DisplayMedia alt is never empty", () => {
  test("altText wins when present (and is trimmed)", () => {
    withFixtureManifest(
      [fixtureMedia("m-alt", "Some title", "  Crew on a job site  ")],
      () => {
        const out = listObjectMedia(FIXTURE_SITE, graph(), "biz-t11");
        expect(out).toHaveLength(1);
        expect(out[0].alt).toBe("Crew on a job site");
      },
    );
  });

  test("falls back to the media title when altText is absent", () => {
    withFixtureManifest([fixtureMedia("m-title", "Shop front", null)], () => {
      const out = listObjectMedia(FIXTURE_SITE, graph(), "biz-t11");
      expect(out).toHaveLength(1);
      expect(out[0].alt).toBe("Shop front");
    });
  });

  test("falls back to the floor text when altText and title are empty", () => {
    withFixtureManifest([fixtureMedia("m-none", "", "   ")], () => {
      const out = listObjectMedia(FIXTURE_SITE, graph(), "biz-t11");
      expect(out).toHaveLength(1);
      expect(out[0].alt).toBe("Business photo");
      expect(out[0].alt.length).toBeGreaterThan(0);
    });
  });
});
