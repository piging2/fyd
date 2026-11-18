/**
 * TENANT-2: preserve both service and product catalogs for mixed
 * businesses. The renderer previously chose ONE primary catalog by
 * object counts and rendered only it, so a business whose approved
 * SiteSpec carried both Services and Products showed just one
 * collection publicly. The fix renders each independently eligible,
 * visible catalog in SiteSpec order; the primary still determines
 * emphasis and the first CTA. Eligibility and visibility stay the
 * plan's: a catalog renders exactly when its spec section exists, is
 * not hidden, and yields titled objects after the existing hidden
 * and ordering filters.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VisitorExperience } from "../visitor-experience";
import type { RenderContext } from "../renderer";
import { COPPERSMITH_GRAPH } from "../../proceduralize/__fixtures__/coppersmith-graph";
import { generateSiteSpec } from "../../proceduralize/generator";
import type { ObjectGraph } from "../../sitespec/types";
import type { PingObject } from "../../../lib/ping/types";

const OPTS = { generatedAt: "2026-09-21T12:00:00.000Z" };
const OWNER_ID = "website-business-2f1327c09d622175";

function productObject(suffix: string, title: string): PingObject {
  return {
    id: `${OWNER_ID}-product-${suffix}`,
    schema: "ping.social.product@1",
    controllerId: "identity_fyd_compiler_test",
    visibility: "public",
    title,
    description: `${title} description from the fixture.`,
    fields: {
      name: title,
      description: `${title} description from the fixture.`,
      claimKind: "website_statement",
    },
    createdAt: "2026-09-21T13:50:00Z",
    updatedAt: "2026-09-21T13:50:00Z",
    provenance: {
      kind: "website-derived",
      ref: "website-ingestion:https://www.coppersmithplumbing.com/",
      derivedAt: "2026-09-21T13:50:00Z",
    },
  } as PingObject;
}

function offers(productId: string, n: number) {
  return {
    id: `rel-fixture-product-${n}`,
    subject: OWNER_ID,
    predicate: "offers",
    object: productId,
    status: "active",
    createdAt: "2026-09-21T13:50:00Z",
    evidenceRef: "fixture:tenant-t2",
  };
}

function clone(graph: ObjectGraph): ObjectGraph {
  return JSON.parse(JSON.stringify(graph)) as ObjectGraph;
}

function mixedGraph(): ObjectGraph {
  const g = clone(COPPERSMITH_GRAPH);
  const p1 = productObject("aaaa00000001", "Copper Pipe Kit");
  const p2 = productObject("aaaa00000002", "Press Fit Valve");
  g.objects.push(p1, p2);
  g.relationships.push(offers(p1.id, 1), offers(p2.id, 2));
  return g;
}

function productOnlyGraph(): ObjectGraph {
  const g = mixedGraph();
  const serviceIds = new Set(
    g.objects.filter((o) => o.schema === "ping.social.service@1").map((o) => o.id),
  );
  g.objects = g.objects.filter((o) => !serviceIds.has(o.id));
  g.relationships = g.relationships.filter(
    (r) => !serviceIds.has(r.object) && !serviceIds.has(r.subject),
  );
  return g;
}

function zeroGraph(): ObjectGraph {
  const g = clone(COPPERSMITH_GRAPH);
  g.objects = g.objects.filter((o) => o.id === OWNER_ID);
  g.relationships = [];
  return g;
}

function contextFor(graph: ObjectGraph, hideProducts = false): RenderContext {
  const spec = generateSiteSpec(graph, OPTS);
  if (hideProducts) {
    for (const page of spec.pages) {
      for (const s of page.sections) {
        if (s.component === "Products") s.presentation.hidden = true;
      }
    }
  }
  return {
    graph,
    spec,
    viewer: { viewerId: null, displayName: null },
    siteId: "test",
  } as RenderContext;
}

function rendered(ctx: RenderContext): string {
  return renderToStaticMarkup(createElement(VisitorExperience, { ctx }));
}

describe("TENANT-2: both catalogs survive for mixed businesses", () => {
  test("mixed: services and products both render, each reachable by nav", () => {
    const html = rendered(contextFor(mixedGraph()));
    expect(html).toContain('id="services"');
    expect(html).toContain('id="products"');
    expect(html).toContain('href="#services"');
    expect(html).toContain('href="#products"');
    expect(html).toContain("Plumbing");
    expect(html).toContain("Copper Pipe Kit");
    expect(html).toContain("Press Fit Valve");
  });

  test("service-only: services render, no products section or nav link", () => {
    const html = rendered(contextFor(clone(COPPERSMITH_GRAPH)));
    expect(html).toContain('id="services"');
    expect(html).not.toContain('id="products"');
    expect(html).not.toContain('href="#products"');
  });

  test("product-only: products render, no services section or nav link", () => {
    const html = rendered(contextFor(productOnlyGraph()));
    expect(html).toContain('id="products"');
    expect(html).toContain("Copper Pipe Kit");
    expect(html).not.toContain('id="services"');
    expect(html).not.toContain('href="#services"');
  });

  test("hidden secondary: a hidden Products section stays absent", () => {
    const html = rendered(contextFor(mixedGraph(), true));
    expect(html).toContain('id="services"');
    expect(html).not.toContain('id="products"');
    expect(html).not.toContain("Copper Pipe Kit");
  });

  test("zero content: no catalog section renders at all", () => {
    const html = rendered(contextFor(zeroGraph()));
    expect(html).not.toContain('id="services"');
    expect(html).toContain("ve");
    expect(html).not.toContain('id="products"');
    expect(html).not.toContain("ve-catalog");
  });
});
