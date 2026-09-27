/**
 * Mobile-objects invariant tests (mobile-objects lane).
 *
 * The product law under test: SAME OBJECTS, SAME GRAPH, DIFFERENT
 * RESPONSIVE PROJECTION. The mobile render must never be a static
 * projection while desktop owns the object model: every public object
 * resolved by a section query on a generated page carries at least one
 * /o/<id> doorway in the rendered HTML, and the doorway opens the
 * compact object experience (identity/type, facts, relationships,
 * evidence/WHY THIS, capabilities, Ask FYD, Open).
 *
 * These run the REAL projection path (the same pipeline that serves the
 * public pages):
 *   COPPERSMITH fixture -> planSite -> buildRenderContext ->
 *   renderToStaticMarkup(SitePageView)
 *
 * Polish lane (2026-09-26): planSite omits narration-only and handle-only
 * objects/sections at plan time, so the section queries the invariant
 * enumerates already exclude them. The invariant's refined form: every
 * object the PLANNER resolves into a section carries a doorway.
 *
 * The doorway is the anti-flattening primitive: if an object appears in
 * the graph and resolves into a section but its identity disappears into
 * flattened copy during rendering, the per-page union assertion below
 * fails and names the lost object id.
 */

import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import {
  SitePageView,
  buildRenderContext,
  resolveQuery,
  ObjectDoorway,
} from "../renderer";
import {
  ObjectOverlay,
  overlayFacts,
  overlayRelationships,
} from "../object-overlay";
import { planSite } from "../../builder/planner";
import { COPPERSMITH_VECTOR } from "../../builder/dimensions";
import { COPPERSMITH_GRAPH } from "../../proceduralize/__fixtures__/coppersmith-graph";
import type { ObjectGraph, ViewerContext } from "../../sitespec/types";
import type { PingObject } from "@/lib/ping/types";

const VIEWER: ViewerContext = { viewerId: null, displayName: null };
const GRAPH = COPPERSMITH_GRAPH as unknown as ObjectGraph;

function doorwayHref(id: string): string {
  return `/o/${encodeURIComponent(id)}`;
}

function plannedSpec() {
  return planSite({
    ctx: { tenantId: "coppersmith-test" },
    graph: GRAPH,
    vector: COPPERSMITH_VECTOR,
    generatedAt: "2026-09-24T00:00:00Z",
  }).spec;
}

function renderPage(slug: string): string {
  const spec = plannedSpec();
  const ctx = buildRenderContext(spec, GRAPH, VIEWER);
  const page = spec.pages.find((p) => p.slug === slug);
  if (!page) throw new Error(`no page ${slug}`);
  return renderToStaticMarkup(SitePageView({ page, ctx }));
}

/** Distinct object ids resolved across every section of one page. */
function pageObjectIds(slug: string): string[] {
  const spec = plannedSpec();
  const page = spec.pages.find((p) => p.slug === slug);
  if (!page) throw new Error(`no page ${slug}`);
  const ids = new Set<string>();
  for (const s of page.sections) {
    for (const o of resolveQuery(s.query, GRAPH, spec.ownerObjectId)) {
      ids.add(o.id);
    }
  }
  return [...ids].sort();
}

describe("mobile objects: doorway invariant", () => {
  const slugs = ["home", "about", "services", "explore"];

  test.each(slugs)(
    "every section-resolved object on page %s has a /o/<id> doorway",
    (slug) => {
      const html = renderPage(slug);
      const missing: string[] = [];
      for (const id of pageObjectIds(slug)) {
        if (!html.includes(doorwayHref(id))) missing.push(id);
      }
      expect(missing).toEqual([]);
    },
  );

  test("home hero exposes the business object doorway on every viewport", () => {
    const html = renderPage("home");
    const business = GRAPH.objects.find((o) => o.schema === "ping.social.business@1");
    expect(business).toBeDefined();
    // The hero doorway: same markup server and client, no md: gating.
    expect(html).toContain(doorwayHref(business!.id));
    expect(html).toContain(`data-fyd-object-id="${business!.id}"`);
  });

  test("explore feed items link their object titles to /o/<id>", () => {
    const html = renderPage("explore");
    const services = GRAPH.objects.filter((o) => o.schema === "ping.social.service@1");
    expect(services.length).toBeGreaterThan(0);
    for (const s of services) {
      expect(html).toContain(doorwayHref(s.id));
    }
  });

  test("mobile in-flow composition blocks are present in the markup", () => {
    const html = renderPage("home");
    expect(html).toContain('data-inflow-composition="mobile"');
  });
});

describe("ObjectDoorway", () => {
  test("renders nothing when the title binding does not verify", () => {
    const spec = plannedSpec();
    const ctx = buildRenderContext(spec, GRAPH, VIEWER);
    const orphan: PingObject = {
      id: "orphan-1",
      schema: "ping.social.service@1",
      controllerId: "x",
      visibility: "public",
      title: "",
      description: "",
      fields: {},
      createdAt: "2026-09-24T00:00:00Z",
      updatedAt: "2026-09-24T00:00:00Z",
      provenance: { kind: "website-derived", ref: "", derivedAt: "" },
    };
    const html = renderToStaticMarkup(
      ObjectDoorway({ o: orphan, theme: spec.themeTokens, ctx }),
    );
    expect(html).not.toContain("/o/");
  });
});

describe("ObjectOverlay compact experience", () => {
  const business = GRAPH.objects.find(
    (o) => o.schema === "ping.social.business@1",
  )!;

  test("overlayFacts returns binding-verified scalar facts", () => {
    const facts = overlayFacts(business, GRAPH);
    const labels = facts.map((f) => f.label);
    expect(labels).toContain("Phone");
    expect(labels).toContain("Hours");
    // Denylist: internal bookkeeping never surfaces.
    expect(labels).not.toContain("ClaimKind");
    expect(labels).not.toContain("Locale");
  });

  test("overlayFacts fails closed on unbound fields", () => {
    const unbound: PingObject = {
      ...business,
      id: "unbound-1",
      fields: { phone: "970-555-0100" },
      provenance: { kind: "website-derived", ref: "", derivedAt: "" },
    };
    const graph: ObjectGraph = {
      ...GRAPH,
      objects: [...GRAPH.objects, unbound],
    };
    expect(overlayFacts(unbound, graph)).toEqual([]);
  });

  test("overlayFacts coarsens address-bearing fields, never raw", () => {
    const withAddr: PingObject = {
      ...business,
      id: "addr-1",
      fields: { address: "630 Maldonado Street, Grand Junction, CO 81501" },
    };
    const graph: ObjectGraph = {
      ...GRAPH,
      objects: [...GRAPH.objects, withAddr],
    };
    const facts = overlayFacts(withAddr, graph);
    const addr = facts.find((f) => f.label === "Address");
    expect(addr).toBeDefined();
    expect(addr!.value).not.toContain("630 Maldonado Street");
  });

  test("overlayRelationships lists active relationships with neighbor doorways", () => {
    const rels = overlayRelationships(business, GRAPH);
    expect(rels.length).toBeGreaterThan(0);
    const offers = rels.find((r) => r.predicateLabel === "Offers");
    expect(offers).toBeDefined();
    expect(offers!.neighborTitle.length).toBeGreaterThan(0);
  });

  test("overlay renders identity, type, facts, relationships, WHY THIS, Ask FYD, Open", () => {
    const html = renderToStaticMarkup(
      React.createElement(ObjectOverlay, {
        object: business,
        graph: GRAPH,
        siteId: "coppersmith-plumbing",
        onClose: () => {},
        // LANE-8: the full detail rendering (WhyThis drill-down, raw
        // provenance) is the engineer projection; absent fails closed to
        // the quiet visitor treatment.
        viewerKind: "engineer",
      }),
    );
    // Identity + type.
    expect(html).toContain(business.title);
    expect(html).toContain("business");
    // Facts.
    expect(html).toContain("Details");
    expect(html).toContain("970-245-3869");
    // Relationships.
    expect(html).toContain("Related");
    // WHY THIS drill-down (honest evidence chain, no byte-span claims).
    expect(html).toContain("Why this?");
    // Ask FYD entry.
    expect(html).toContain("Ask FYD about this");
    expect(html).toContain(`/o/${encodeURIComponent(business.id)}#ask`);
    // Open full object.
    expect(html).toContain("Open full object");
    // The Open full object link carries the interception bypass so it
    // really navigates to the node route instead of reopening the
    // overlay through the site client's /o/ handler.
    expect(html).toContain('data-fyd-open-full="true"');
  });

  test("neighbor links in the overlay point back at /o/<id> for traversal", () => {
    const html = renderToStaticMarkup(
      React.createElement(ObjectOverlay, {
        object: business,
        graph: GRAPH,
        siteId: "coppersmith-plumbing",
        onClose: () => {},
      }),
    );
    const rels = overlayRelationships(business, GRAPH);
    for (const r of rels) {
      expect(html).toContain(doorwayHref(r.neighborId));
    }
  });
});
