/**
 * CTA conversion-intent tests (polish lane, 2026-09-26).
 *
 * The visitor CTA is the business's real conversion intent, never a
 * self-referential "Visit website". Selection prefers a graph-backed
 * estimate/quote intent when the graph backs one (a service object's
 * service_href naming an estimate/quote path, resolved through
 * resolveSafeLink against the verified website as the explicit base),
 * then the binding-verified phone, then the verified email. Nothing is
 * invented: no qualifying href means no estimate CTA.
 *
 * Run: npx jest --config src/fyd/components/jest.config.cjs cta-conversion
 */

import { renderToStaticMarkup } from "react-dom/server";
import { SitePageView, buildRenderContext } from "../renderer";
import { planSite } from "../../builder/planner";
import { COPPERSMITH_VECTOR } from "../../builder/dimensions";
import { HAPPY_PLACE_GRAPH } from "../../proceduralize/__fixtures__/happy-place-graph";
import type { ObjectGraph, ViewerContext, FYDSiteSpec } from "../../sitespec/types";
import type { PingObject } from "@/lib/ping/types";

const VIEWER: ViewerContext = { viewerId: null, displayName: null };
const GRAPH = HAPPY_PLACE_GRAPH as unknown as ObjectGraph;
const STAMP = "2026-09-24T00:00:00Z";

function plannedSpec(graph: ObjectGraph): FYDSiteSpec {
  return planSite({
    ctx: { tenantId: "cta-conversion-test" },
    graph,
    vector: COPPERSMITH_VECTOR,
    generatedAt: STAMP,
  }).spec;
}

/** The CTA section's static markup (the "Start the conversation" block). */
function ctaMarkup(body: string): string {
  const marker = body.indexOf("Start the conversation");
  expect(marker).toBeGreaterThan(-1);
  const open = body.lastIndexOf("<section", marker);
  const close = body.indexOf("</section>", marker);
  expect(close).toBeGreaterThan(open);
  return body.slice(open, close);
}

function renderCta(graph: ObjectGraph): string {
  const spec = plannedSpec(graph);
  const ctx = buildRenderContext(spec, graph, VIEWER);
  const page = spec.pages.find((p) => p.slug === "home");
  expect(page).toBeDefined();
  const body = renderToStaticMarkup(SitePageView({ page: page!, ctx }));
  return ctaMarkup(body);
}

/** Clone the graph with every service_href rewritten by fn. */
function rewriteServiceHrefs(
  graph: ObjectGraph,
  fn: (href: string) => string | null,
): ObjectGraph {
  const clone = JSON.parse(JSON.stringify(graph)) as ObjectGraph;
  for (const o of clone.objects) {
    const fields = o.fields as Record<string, unknown>;
    if (typeof fields["service_href"] === "string") {
      const next = fn(fields["service_href"] as string);
      if (next === null) delete fields["service_href"];
      else fields["service_href"] = next;
    }
  }
  return clone;
}

describe("CTA conversion intent", () => {
  test("graph-backed estimate intent wins: relative href resolves against the verified website", () => {
    const cta = renderCta(GRAPH);
    // The first estimate candidate in id order is the repairs service.
    expect(cta).toContain("Get an estimate");
    expect(cta).toContain('href="https://happyplacecarpentry.com/estimate?service=repairs"');
    // The phone fallback is not the primary conversion when an estimate
    // intent exists.
    expect(cta).not.toContain("data-fyd-contact=\"phone\"");
    expect(cta).toContain("Ask FYD");
  });

  test("no estimate href in the graph: falls back to the verified phone", () => {
    const graph = rewriteServiceHrefs(GRAPH, () => null);
    const cta = renderCta(graph);
    expect(cta).not.toContain("Get an estimate");
    expect(cta).toContain('data-fyd-contact="phone"');
  });

  test("non-estimate service hrefs are not conversion intents", () => {
    const graph = rewriteServiceHrefs(GRAPH, () => "/services/plumbing/");
    const cta = renderCta(graph);
    expect(cta).not.toContain("Get an estimate");
    expect(cta).not.toContain("Request a quote");
    expect(cta).toContain('data-fyd-contact="phone"');
  });

  test("unsafe estimate href is rejected: nothing navigable, phone fallback", () => {
    const graph = rewriteServiceHrefs(GRAPH, (href) =>
      href.includes("estimate") ? "javascript:alert(1)" : href,
    );
    const cta = renderCta(graph);
    expect(cta).not.toContain("javascript:");
    expect(cta).not.toContain("Get an estimate");
    expect(cta).toContain('data-fyd-contact="phone"');
  });

  test("quote intent labels honestly from the URL", () => {
    const graph = rewriteServiceHrefs(GRAPH, (href) =>
      href.includes("estimate") ? "/quote?service=repairs" : null,
    );
    const cta = renderCta(graph);
    expect(cta).toContain("Request a quote");
    expect(cta).toContain('href="https://happyplacecarpentry.com/quote?service=repairs"');
  });

  test("CTA render is deterministic", () => {
    const a = renderCta(GRAPH);
    const b = renderCta(GRAPH);
    expect(a).toBe(b);
  });
});
