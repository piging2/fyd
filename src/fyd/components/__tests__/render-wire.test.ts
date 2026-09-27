/**
 * LANE-RENDER-WIRE: section composition variant tests.
 *
 * - pairBeforeAfter returns no pairs without an explicit pair identifier:
 *   the contract never infers before/after relationships.
 * - Gallery: fewer than two assets renders nothing; grid and masonry
 *   variants dispatch on presentation.compositionVariant; hero-role assets
 *   are excluded from the section.
 * - Services: feature/grid/rows variants dispatch; feature requires a real
 *   photograph on the featured object.
 * - Posts/RecentObjects/ObjectFeed: list/grid/archive dispatch.
 * - withHeroFocalPoint fails closed (no manifest): hero passes through
 *   unchanged.
 */

import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import {
  pairBeforeAfter,
  renderSection,
  type RenderContext,
} from "../renderer";
import { withHeroFocalPoint } from "@/app/sites/_shared/spec-pipeline";
import type {
  FYDSection,
  FYDSiteSpec,
  ObjectGraph,
} from "../../sitespec/types";
import type { DisplayMedia } from "@/fyd/media/select";
import type { PingObject } from "@/lib/ping/types";

function pingObject(partial: Partial<PingObject> & { id: string }): PingObject {
  return {
    schema: "business",
    controllerId: "web:example",
    visibility: "public",
    title: "Test Object",
    description: "",
    fields: {},
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    provenance: {
      kind: "website-derived",
      ref: "https://example.com",
      derivedAt: "2026-09-15T00:00:00.000Z",
    },
    ...partial,
  };
}

const THEME = {
  accent: "#8a6d1b",
  accentForeground: "#ffffff",
  surface: "#ffffff",
  ink: "#1a1a1a",
  radius: 12,
  fontDisplay: "Georgia, serif",
  fontBody: "system-ui, sans-serif",
};

function testCtx(
  graph: ObjectGraph,
  extra?: Partial<RenderContext>,
): RenderContext {
  const spec = {
    siteId: "wire-test",
    ownerObjectId: "biz-1",
    siteName: "Wire Test",
    themeTokens: THEME,
    pages: [],
  } as unknown as FYDSiteSpec;
  return {
    spec,
    graph,
    viewer: { viewerId: null, displayName: null },
    viewerKind: "visitor",
    heroMedia: null,
    galleryMedia: null,
    ...extra,
  };
}

function testSection(
  component: string,
  presentation: Record<string, unknown> = {},
  query: FYDSection["query"] = { kind: "static" },
): FYDSection {
  return {
    id: `home:${component}:0`,
    component,
    query,
    presentation: { heading: `Test ${component}`, ...presentation },
  };
}

function renderHtml(section: FYDSection, ctx: RenderContext): string {
  const node = renderSection(section, ctx, 0);
  if (!node) return "";
  return renderToStaticMarkup(node as ReactElement);
}


function testMedia(partial: Partial<DisplayMedia> & { id: string }): DisplayMedia {
  return {
    role: "gallery",
    src: `https://media.example/${partial.id}.jpg`,
    blurUrl: null,
    width: 1200,
    height: 800,
    alt: `Photo ${partial.id}`,
    rightsSource: "owner-provided",
    rightsBasis: "owner upload",
    sourceUrl: `https://example.com/${partial.id}`,
    digest: `digest-${partial.id}`,
    observedAt: "2026-09-20T00:00:00.000Z",
    ...partial,
  };
}

const EMPTY_GRAPH: ObjectGraph = { objects: [], relationships: [] };

describe("pairBeforeAfter", () => {
  it("returns no pairs and all singles without a pair identifier", () => {
    const media = [testMedia({ id: "a" }), testMedia({ id: "b" })];
    const { pairs, singles } = pairBeforeAfter(media);
    expect(pairs).toEqual([]);
    expect(singles.map((m) => m.id)).toEqual(["a", "b"]);
  });

  it("returns empty for empty input", () => {
    expect(pairBeforeAfter([])).toEqual({ pairs: [], singles: [] });
  });
});

describe("Gallery variants", () => {
  const section = (variant: string, extra: Record<string, unknown> = {}) =>
    testSection("Gallery", { compositionVariant: variant, ...extra });

  it("renders nothing with fewer than two assets", () => {
    const ctx = testCtx(EMPTY_GRAPH, {
      galleryMedia: [testMedia({ id: "only" })],
    });
    expect(renderHtml(section("grid"), ctx)).toBe("");
  });

  it("renders nothing with no assets", () => {
    const ctx = testCtx(EMPTY_GRAPH, { galleryMedia: null });
    expect(renderHtml(section("grid"), ctx)).toBe("");
  });

  it("grid variant uses the uniform grid, masonry uses columns", () => {
    const assets = ["g1", "g2", "g3", "g4"].map((id) => testMedia({ id }));
    const ctx = testCtx(EMPTY_GRAPH, { galleryMedia: assets });
    const grid = renderHtml(section("grid"), ctx);
    expect(grid).toContain("fyd-gallery-grid");
    expect(grid).not.toContain("fyd-gallery-masonry");
    const masonry = renderHtml(section("masonry"), ctx);
    expect(masonry).toContain("fyd-gallery-masonry");
    expect(masonry).not.toContain("fyd-gallery-grid");
  });

  it("never renders a BeforeAfter without an explicit pair", () => {
    const assets = ["g1", "g2", "g3"].map((id) => testMedia({ id }));
    const ctx = testCtx(EMPTY_GRAPH, { galleryMedia: assets });
    const html = renderHtml(section("grid"), ctx);
    expect(html).not.toContain("data-fyd-before-after-set");
  });
});

describe("Services variants", () => {
  const services = ["svc-1", "svc-2", "svc-3"].map((id, i) =>
    pingObject({
      id,
      schema: "service",
      title: `Service ${i + 1}`,
      description: `Description ${i + 1}`,
    }),
  );
  const graph: ObjectGraph = { objects: services, relationships: [] };
  const query = {
    kind: "reference",
    objectIds: ["svc-1", "svc-2", "svc-3"],
  } as const;

  it("grid is the default variant", () => {
    const ctx = testCtx(graph);
    const html = renderHtml(testSection("Services", {}, query), ctx);
    expect(html).toContain("lg:grid-cols-3");
    expect(html).toContain("Service 1");
  });

  it("rows variant renders the list layout", () => {
    const ctx = testCtx(graph);
    const html = renderHtml(
      testSection("Services", { compositionVariant: "rows" }, query),
      ctx,
    );
    expect(html).toContain("divide-y divide-border-soft");
    expect(html).not.toContain("lg:grid-cols-3");
    expect(html).toContain("Service 2");
  });

  it("feature variant renders the editorial split for one featured service with a photo", () => {
    const photo = testMedia({ id: "svc-photo", role: "object" });
    const ctx = testCtx(graph, {
      objectMedia: { "svc-1": [photo] },
    });
    const html = renderHtml(
      testSection(
        "Services",
        { compositionVariant: "feature", featuredIds: ["svc-1"] },
        query,
      ),
      ctx,
    );
    expect(html).toContain("md:grid-cols-2");
    expect(html).toContain("svc-photo.jpg");
  });

  it("feature falls back to the grid without a photograph", () => {
    const ctx = testCtx(graph);
    const html = renderHtml(
      testSection(
        "Services",
        { compositionVariant: "feature", featuredIds: ["svc-1"] },
        query,
      ),
      ctx,
    );
    expect(html).toContain("lg:grid-cols-3");
  });

  it("renders nothing with no services and no copy", () => {
    const ctx = testCtx(EMPTY_GRAPH);
    const html = renderHtml(
      testSection("Services", {}, { kind: "reference", objectIds: [] }),
      ctx,
    );
    expect(html).toBe("");
  });
});

describe("Posts / RecentObjects / ObjectFeed variants", () => {
  const posts = [0, 1, 2].map((i) =>
    pingObject({
      id: `post-${i}`,
      schema: "post",
      title: `Post ${i + 1}`,
      description: `Excerpt ${i + 1}`,
      fields: { date: `2026-09-${String(10 + i).padStart(2, "0")}T12:00:00.000Z` },
    }),
  );
  const graph: ObjectGraph = { objects: posts, relationships: [] };
  const query = {
    kind: "reference",
    objectIds: ["post-0", "post-1", "post-2"],
  } as const;

  it("Posts: grid is the default, list and archive dispatch", () => {
    const ctx = testCtx(graph);
    const def = renderHtml(testSection("Posts", {}, query), ctx);
    expect(def).toContain("md:grid-cols-2");
    expect(def).toContain("<article");
    const list = renderHtml(
      testSection("Posts", { compositionVariant: "list" }, query),
      ctx,
    );
    expect(list).toContain("<ol");
    expect(list).not.toContain("md:grid-cols-2");
    const archive = renderHtml(
      testSection("Posts", { compositionVariant: "archive" }, query),
      ctx,
    );
    expect(archive).toContain("September 2026");
  });

  it.each(["RecentObjects", "ObjectFeed"])(
    "%s: list is the default, grid and archive dispatch",
    (component) => {
      const ctx = testCtx(graph);
      const def = renderHtml(testSection(component, {}, query), ctx);
      expect(def).toContain("<ol");
      expect(def).not.toContain("lg:grid-cols-3");
      const grid = renderHtml(
        testSection(component, { compositionVariant: "grid" }, query),
        ctx,
      );
      expect(grid).toContain("lg:grid-cols-3");
      const archive = renderHtml(
        testSection(component, { compositionVariant: "archive" }, query),
        ctx,
      );
      expect(archive).toContain("September 2026");
    },
  );

  it("archive groups by month", () => {
    const mixed = [
      pingObject({
        id: "aug-post",
        schema: "post",
        title: "August post",
        fields: { date: "2026-08-05T12:00:00.000Z" },
      }),
      pingObject({
        id: "sep-post",
        schema: "post",
        title: "September post",
        fields: { date: "2026-09-05T12:00:00.000Z" },
      }),
    ];
    const ctx = testCtx({ objects: mixed, relationships: [] });
    const html = renderHtml(
      testSection(
        "Posts",
        { compositionVariant: "archive" },
        { kind: "reference", objectIds: ["aug-post", "sep-post"] },
      ),
      ctx,
    );
    expect(html).toContain("August 2026");
    expect(html).toContain("September 2026");
  });
});

describe("withHeroFocalPoint", () => {
  it("passes the hero through unchanged with no manifest (fail-closed)", () => {
    const hero = testMedia({ id: "hero", role: "hero" });
    expect(withHeroFocalPoint("no-such-site", hero)).toBe(hero);
    expect(withHeroFocalPoint("no-such-site", null)).toBeNull();
  });
});
