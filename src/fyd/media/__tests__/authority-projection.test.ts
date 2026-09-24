/**
 * Tests for the projection stage (authority-projection.ts).
 *
 * The projection is the factory's thin-consumer read seam: semantic
 * attachment (graph) + evidence (manifest) joined with the PING
 * authority's serving truth (the public media gate). The gate is
 * injected, so these tests never touch KV, Blob, or the network.
 *
 * Pins the lane's required cases:
 * - same graph -> same media selection (determinism, order-independent);
 * - owner pick outranks auto; invalid owner picks fall back with a note;
 * - gate rejection is fail-closed;
 * - empty media yields a generated treatment, never a broken image;
 * - the projection never serves the pipeline's source URL (no hotlinking).
 */

import type { Media, PublishedMediaAsset } from "../../types/media";
import type { ObjectGraph } from "../../sitespec/types";
import type { PingObject } from "../../../lib/ping/types";
import {
  projectHero,
  projectObjectMedia,
  resolveAuthorityHero,
  type ProjectionDeps,
} from "../authority-projection";
import {
  MEDIA_MODULE_VERSION,
  type FydMediaObject,
  type MediaManifest,
} from "../types";

const TS = "2026-09-23T00:00:00.000Z";

const ID_A = "fyd-media-aaaaaaaaaaaaaaaa";
const ID_B = "fyd-media-bbbbbbbbbbbbbbbb";
const ID_C = "fyd-media-cccccccccccccccc";

function businessObject(id: string): PingObject {
  return {
    id,
    schema: "ping.social.business@1",
    controllerId: "web:" + id,
    visibility: "public",
    title: "Test Business",
    description: "A test business for the authority projection.",
    fields: {},
    createdAt: TS,
    updatedAt: TS,
    provenance: { kind: "website-derived", ref: "test", derivedAt: TS },
  };
}

function testGraph(): ObjectGraph {
  return { objects: [businessObject("biz-1")], relationships: [] };
}

function fixtureEntry(
  id: string,
  roles: FydMediaObject["roles"],
  digestChar: string,
): FydMediaObject {
  const digest = digestChar.repeat(64);
  return {
    id,
    schema: "ping.social.media@1",
    title: "Fixture " + id,
    mediaType: "image",
    roles,
    rightsSource: "business-provided",
    rightsBasis: "Business-provided fixture for the projection test.",
    lifecycle: "published",
    provenance: {
      sourceUrl: "https://example.com/" + id + ".jpg",
      sourcePage: "https://example.com/",
      observedAt: TS,
    },
    digest,
    originalFormat: "jpeg",
    width: 1200,
    height: 800,
    variants: [
      {
        name: "hero",
        width: 1200,
        height: 800,
        format: "webp",
        url: "/fyd-media/" + digest + "/hero-1200w.webp",
        bytes: 5000,
        digest,
        derivedFrom: digest,
      },
    ],
    depicts: ["biz-1"],
    altText: "Alt " + id,
    altTextSource: "source",
    visibility: "public",
  };
}

function fixtureManifest(entries: FydMediaObject[]): MediaManifest {
  return {
    siteId: "test-site",
    generatedAt: TS,
    generator: MEDIA_MODULE_VERSION,
    ingestRunId: "test-run-projection",
    pipelineVersion: MEDIA_MODULE_VERSION,
    observations: [],
    media: entries,
  };
}

function authorityRecord(id: string, roles: string[]): PublishedMediaAsset {
  return {
    id,
    filename: id + ".webp",
    type: "image",
    orientation: "landscape",
    alt: "Authority alt " + id,
    tags: ["fyd-media"],
    roles: roles as PublishedMediaAsset["roles"],
    contentHash: "d".repeat(64),
    source: "local",
    lifecycleState: "published",
    storage: "blob",
    dimensions: { width: 1200, height: 800 },
    variants: {
      original: "https://blob.test/" + id + "-original.jpg",
      webp: "https://blob.test/" + id + ".webp",
      thumbnail: "https://blob.test/" + id + "-thumb.webp",
      blur: "data:image/webp;base64,AAAA",
    },
    createdAt: TS,
    uploadedAt: TS,
  };
}

function fakeProjection(approved: Map<string, Media>): ProjectionDeps {
  return {
    resolvePublicMedia: async (id: string) => approved.get(id) ?? null,
  };
}

function fullSetup() {
  const a = fixtureEntry(ID_A, ["hero"], "a");
  const b = fixtureEntry(ID_B, ["gallery"], "b");
  const c = fixtureEntry(ID_C, ["logo"], "c");
  const manifest = fixtureManifest([a, b, c]);
  const approved = new Map<string, Media>([
    [ID_A, authorityRecord(ID_A, ["hero"])],
    [ID_B, authorityRecord(ID_B, ["gallery"])],
    [ID_C, authorityRecord(ID_C, ["logo"])],
  ]);
  return { manifest, approved, a, b, c };
}

describe("projectObjectMedia", () => {
  test("same graph -> same media selection (deterministic)", async () => {
    const { manifest, approved } = fullSetup();
    const deps = fakeProjection(approved);
    const graph = testGraph();
    const first = await projectObjectMedia(graph, manifest, "biz-1", deps);
    const second = await projectObjectMedia(graph, manifest, "biz-1", deps);
    expect(first).toEqual(second);
    expect(first.map((m) => m.id)).toEqual([ID_C, ID_A, ID_B]);
  });

  test("selection is independent of manifest order", async () => {
    const { manifest, approved, a, b, c } = fullSetup();
    const deps = fakeProjection(approved);
    const graph = testGraph();
    const forward = await projectObjectMedia(graph, manifest, "biz-1", deps);
    const reversed = await projectObjectMedia(
      graph,
      fixtureManifest([c, b, a]),
      "biz-1",
      deps,
    );
    expect(reversed).toEqual(forward);
  });

  test("projection never serves the source URL: src is always authority-issued", async () => {
    const { manifest, approved } = fullSetup();
    const list = await projectObjectMedia(
      testGraph(),
      manifest,
      "biz-1",
      fakeProjection(approved),
    );
    expect(list.length).toBeGreaterThan(0);
    for (const m of list) {
      expect(m.src).toMatch(/^https:\/\/blob\.test\//);
      expect(m.src).not.toBe(m.sourceUrl);
    }
  });

  test("gate rejection is fail-closed: rejected assets never project", async () => {
    const { manifest, approved, b } = fullSetup();
    approved.delete(ID_A);
    approved.delete(ID_C);
    const list = await projectObjectMedia(
      testGraph(),
      manifest,
      "biz-1",
      fakeProjection(approved),
    );
    expect(list.map((m) => m.id)).toEqual([b.id]);
  });

  test("an approved record with no usable variant URL is skipped", async () => {
    const { manifest, approved, a } = fullSetup();
    const empty = authorityRecord(a.id, ["hero"]);
    empty.variants = {};
    const list = await projectObjectMedia(
      testGraph(),
      manifest,
      "biz-1",
      fakeProjection(new Map([[a.id, empty]])),
    );
    expect(list).toEqual([]);
  });

  test("a throwing gate is fail-closed, never fatal", async () => {
    const { manifest } = fullSetup();
    const deps: ProjectionDeps = {
      resolvePublicMedia: async () => {
        throw new Error("kv down");
      },
    };
    const list = await projectObjectMedia(testGraph(), manifest, "biz-1", deps);
    expect(list).toEqual([]);
  });

  test("null manifest projects nothing", async () => {
    const { approved } = fullSetup();
    const list = await projectObjectMedia(
      testGraph(),
      null,
      "biz-1",
      fakeProjection(approved),
    );
    expect(list).toEqual([]);
  });
});

describe("resolveAuthorityHero", () => {
  test("owner pick outranks auto", async () => {
    const { manifest, approved, b } = fullSetup();
    const deps = fakeProjection(approved);
    // Auto would pick the hero-role asset A; the owner picks gallery asset B.
    const res = await resolveAuthorityHero(
      testGraph(),
      manifest,
      "biz-1",
      b.id,
      deps,
    );
    expect(res.basis).toBe("owner");
    expect(res.media?.id).toBe(b.id);
    expect(res.ownerSelectedId).toBe(b.id);
    expect(res.note).toMatch(/outrank/i);
  });

  test("no owner pick -> automatic selection", async () => {
    const { manifest, approved, a } = fullSetup();
    const res = await resolveAuthorityHero(
      testGraph(),
      manifest,
      "biz-1",
      null,
      fakeProjection(approved),
    );
    expect(res.basis).toBe("auto");
    expect(res.media?.id).toBe(a.id);
    expect(res.note.length).toBeGreaterThan(0);
  });

  test("unknown owner id falls back to auto with a note", async () => {
    const { manifest, approved, a } = fullSetup();
    const res = await resolveAuthorityHero(
      testGraph(),
      manifest,
      "biz-1",
      "fyd-media-zzzzzzzzzzzzzzzz",
      fakeProjection(approved),
    );
    expect(res.basis).toBe("owner-fallback");
    expect(res.media?.id).toBe(a.id);
    expect(res.note.length).toBeGreaterThan(0);
  });

  test("owner cannot pick the logo as hero", async () => {
    const { manifest, approved, a, c } = fullSetup();
    const res = await resolveAuthorityHero(
      testGraph(),
      manifest,
      "biz-1",
      c.id,
      fakeProjection(approved),
    );
    expect(res.basis).toBe("owner-fallback");
    expect(res.media?.id).toBe(a.id);
    expect(res.media?.role).not.toBe("logo");
  });

  test("owner pick of a gate-rejected asset falls back to auto", async () => {
    const { manifest, approved, a, b } = fullSetup();
    approved.delete(b.id);
    const res = await resolveAuthorityHero(
      testGraph(),
      manifest,
      "biz-1",
      b.id,
      fakeProjection(approved),
    );
    expect(res.basis).toBe("owner-fallback");
    expect(res.media?.id).toBe(a.id);
  });

  test("deterministic: same inputs, same resolution", async () => {
    const { manifest, approved, b } = fullSetup();
    const deps = fakeProjection(approved);
    const graph = testGraph();
    const first = await resolveAuthorityHero(graph, manifest, "biz-1", b.id, deps);
    const second = await resolveAuthorityHero(graph, manifest, "biz-1", b.id, deps);
    expect(first).toEqual(second);
  });
});

describe("projectHero", () => {
  test("empty media yields a generated treatment, never a broken image", async () => {
    const { manifest } = fullSetup();
    const hero = await projectHero(
      testGraph(),
      manifest,
      "biz-1",
      { title: "Test Business" },
      fakeProjection(new Map()),
    );
    expect(hero.media).toBeNull();
    expect(hero.treatment).not.toBeNull();
    expect(hero.treatment?.kind).toBe("generated-treatment");
    // Structurally not a broken image: no src/url/img key, no remote URL anywhere.
    expect("src" in (hero.treatment as object)).toBe(false);
    expect(JSON.stringify(hero)).not.toMatch(/https?:\/\//);
  });

  test("null manifest also yields a generated treatment", async () => {
    const { approved } = fullSetup();
    const hero = await projectHero(
      testGraph(),
      null,
      "biz-1",
      { title: "Test Business" },
      fakeProjection(approved),
    );
    expect(hero.media).toBeNull();
    expect(hero.treatment?.kind).toBe("generated-treatment");
  });

  test("approved media wins over the treatment: never both set", async () => {
    const { manifest, approved, a } = fullSetup();
    const hero = await projectHero(
      testGraph(),
      manifest,
      "biz-1",
      { title: "Test Business" },
      fakeProjection(approved),
    );
    expect(hero.media?.id).toBe(a.id);
    expect(hero.treatment).toBeNull();
    expect(hero.basis).toBe("auto");
  });

  test("owner pick flows through the hero projection", async () => {
    const { manifest, approved, b } = fullSetup();
    const hero = await projectHero(
      testGraph(),
      manifest,
      "biz-1",
      { ownerHeroId: b.id, title: "Test Business" },
      fakeProjection(approved),
    );
    expect(hero.basis).toBe("owner");
    expect(hero.media?.id).toBe(b.id);
    expect(hero.treatment).toBeNull();
  });

  test("throwing gate yields the generated treatment, not an exception", async () => {
    const { manifest } = fullSetup();
    const deps: ProjectionDeps = {
      resolvePublicMedia: async () => {
        throw new Error("kv down");
      },
    };
    const hero = await projectHero(
      testGraph(),
      manifest,
      "biz-1",
      { title: "Test Business" },
      deps,
    );
    expect(hero.media).toBeNull();
    expect(hero.treatment?.kind).toBe("generated-treatment");
  });
});
