/**
 * Tests for the semantic media attachment (fyd-media@2).
 *
 * Contract: attachment is semantic, not positional. The predicate is
 * chosen by the SUBJECT's schema:
 * - Business represented_by Media
 * - Service illustrated_by Media
 * - Project has_media Media
 * - anything else: has_image (fallback)
 *
 * mediaForObject() is the one selector every surface uses: media follows
 * its object via these relationships. Reference-only assets are never
 * attached, even if a manifest carried one.
 */

import {
  attachMediaToGraph,
  mediaForObject,
  predicateForSubjectSchema,
} from "../attach";
import type { MediaManifest } from "../types";
import type { ObjectGraph } from "../../sitespec/types";

function business(id: string, visibility = "public"): any {
  return {
    id,
    schema: "ping.social.business@1",
    controllerId: "web:" + id,
    visibility,
    title: "Biz " + id,
    description: "",
    fields: {},
    createdAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T00:00:00.000Z",
    provenance: { kind: "website-derived", ref: "test", derivedAt: "2026-09-21T00:00:00.000Z" },
  };
}

function service(id: string): any {
  return { ...business(id), schema: "ping.social.service@1", title: "Svc " + id };
}

function project(id: string): any {
  return { ...business(id), schema: "ping.social.project@1", title: "Proj " + id };
}

function media(id: string, rightsSource: "public-demo-source" | "unclear-reference-only" = "public-demo-source", depicts: string[] = []): any {
  return {
    id,
    title: "Media " + id,
    roles: ["gallery"],
    rightsSource,
    rightsBasis: "basis",
    provenance: { sourceUrl: "https://example.com/" + id, sourcePage: "https://example.com/", observedAt: "2026-09-21T00:00:00.000Z" },
    digest: "d".repeat(64),
    width: 100,
    height: 100,
    originalFormat: "jpeg",
    depicts,
    variants: [],
  };
}

function manifest(media: any[]): MediaManifest {
  return {
    generator: "fyd-media@2",
    siteId: "test",
    generatedAt: "2026-09-21T00:00:00.000Z",
    media,
    observations: [],
  } as unknown as MediaManifest;
}

function graph(objects: any[]): ObjectGraph {
  return { objects, relationships: [] } as unknown as ObjectGraph;
}

describe("predicateForSubjectSchema", () => {
  test("business -> represented_by", () => {
    expect(predicateForSubjectSchema("ping.social.business@1")).toBe("represented_by");
  });
  test("service -> illustrated_by", () => {
    expect(predicateForSubjectSchema("ping.social.service@1")).toBe("illustrated_by");
  });
  test("project -> has_media", () => {
    expect(predicateForSubjectSchema("ping.social.project@1")).toBe("has_media");
  });
  test("anything else -> has_image fallback", () => {
    expect(predicateForSubjectSchema("ping.social.post@1")).toBe("has_image");
    expect(predicateForSubjectSchema("")).toBe("has_image");
  });
});

describe("attachMediaToGraph", () => {
  test("undepicted media attaches to the owner business via represented_by", () => {
    const g = attachMediaToGraph(graph([business("b1")]), manifest([media("m1")]));
    const rels = g.relationships.filter((r) => r.object === "m1");
    expect(rels).toHaveLength(1);
    expect(rels[0].subject).toBe("b1");
    expect(rels[0].predicate).toBe("represented_by");
    // Media object appended; base graph untouched.
    expect(g.objects.some((o) => o.id === "m1")).toBe(true);
  });

  test("depicted service media attaches via illustrated_by", () => {
    const g = attachMediaToGraph(
      graph([business("b1"), service("s1")]),
      manifest([media("m1", "public-demo-source", ["s1"])]),
    );
    const rel = g.relationships.find((r) => r.object === "m1")!;
    expect(rel.subject).toBe("s1");
    expect(rel.predicate).toBe("illustrated_by");
  });

  test("depicted project media attaches via has_media", () => {
    const g = attachMediaToGraph(
      graph([business("b1"), project("p1")]),
      manifest([media("m1", "public-demo-source", ["p1"])]),
    );
    const rel = g.relationships.find((r) => r.object === "m1")!;
    expect(rel.subject).toBe("p1");
    expect(rel.predicate).toBe("has_media");
  });

  test("reference-only assets are never attached", () => {
    const g = attachMediaToGraph(
      graph([business("b1")]),
      manifest([media("m1", "unclear-reference-only")]),
    );
    expect(g.objects.some((o) => o.id === "m1")).toBe(false);
    expect(g.relationships.some((r) => r.object === "m1")).toBe(false);
  });

  test("does not duplicate already-attached media", () => {
    const once = attachMediaToGraph(graph([business("b1")]), manifest([media("m1")]));
    const twice = attachMediaToGraph(once, manifest([media("m1")]));
    expect(twice.objects.filter((o) => o.id === "m1")).toHaveLength(1);
    expect(twice.relationships.filter((r) => r.object === "m1")).toHaveLength(1);
  });
});

describe("mediaForObject", () => {
  test("selects media by semantic relationship, deterministic order", () => {
    const g = attachMediaToGraph(
      graph([business("b1"), service("s1")]),
      manifest([
        media("m-b", "public-demo-source", []),
        media("m-a", "public-demo-source", ["s1"]),
      ]),
    );
    const bizMedia = mediaForObject(g, "b1").map((o) => o.id);
    expect(bizMedia).toEqual(["m-b"]);
    const svcMedia = mediaForObject(g, "s1").map((o) => o.id);
    expect(svcMedia).toEqual(["m-a"]);
    // No media for unknown objects: empty, never an error.
    expect(mediaForObject(g, "nope")).toEqual([]);
  });
});
