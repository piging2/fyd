/**
 * Item 8 (fyd-execution) regression: INV-SC-2 hydration-failure survival.
 *
 * With JS disabled (hydration thrown away), the served HTML MUST contain
 * the core business path: business name + identity block, service summary
 * list, phone/contact affordance as real tel:/mailto: links, working
 * navigation anchors (real hrefs, not onClick), and one service-detail
 * destination. Ask FYD may degrade to a visible "requires JavaScript"
 * note.
 *
 * The test renders the server tree to static markup (no hydration) for
 * BOTH site fixtures and asserts the business path is present as plain
 * HTML. No per-business assertions: every expectation is derived from the
 * fixture's own visitorExperiencePlan.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  VisitorExperience,
  visitorExperiencePlan,
} from "@/fyd/components/visitor-experience";
import { generateSiteSpec } from "@/fyd/proceduralize/generator";
import { COPPERSMITH_GRAPH } from "@/fyd/proceduralize/__fixtures__/coppersmith-graph";
import { HAPPY_PLACE_GRAPH } from "@/fyd/proceduralize/__fixtures__/happy-place-graph";
import type { ObjectGraph } from "@/fyd/sitespec/types";
import { resolveSafeLink } from "@/fyd/sitespec/safe-link";

const SITES: Array<{ siteId: string; graph: ObjectGraph }> = [
  { siteId: "coppersmith-plumbing", graph: COPPERSMITH_GRAPH },
  { siteId: "happy-place", graph: HAPPY_PLACE_GRAPH },
];

function ctxFor(siteId: string, graph: ObjectGraph) {
  return {
    graph,
    spec: generateSiteSpec(graph, { generatedAt: "2026-10-07T00:00:00.000Z" }),
    viewer: { viewerId: null, displayName: null },
    siteId,
    heroMedia: null,
  };
}

describe.each(SITES)("hydration-failure survival ($siteId)", ({ siteId, graph }) => {
  const ctx = ctxFor(siteId, graph);
  const plan = visitorExperiencePlan(ctx);
  const html = renderToStaticMarkup(createElement(VisitorExperience, { ctx }));

  test("business name and identity block render as plain HTML", () => {
    expect(plan).not.toBeNull();
    expect(html).toContain("<h1>");
    expect(html).toContain(plan!.name);
  });

  test("service summary list renders without JS", () => {
    const catalog = plan!.primary === "products" ? plan!.products : plan!.services;
    expect(catalog.length).toBeGreaterThan(0);
    for (const o of catalog.slice(0, 3)) {
      expect(html).toContain(`data-service-id="${o.id}"`);
    }
  });

  test("phone/contact affordance is a real tel:/mailto: link", () => {
    if (plan!.phone.kind === "safe") {
      expect(plan!.phone.href).toMatch(/^(tel:|mailto:)/);
      expect(html).toContain(`href="${plan!.phone.href}"`);
    } else {
      // No safe phone: the contact block must still offer website/email.
      const email = resolveSafeLink(plan!.emailValue, "email");
      const website = resolveSafeLink(plan!.websiteValue, "navigate");
      expect(email.kind === "safe" || website.kind === "safe").toBe(true);
    }
  });

  test("navigation anchors are real hrefs, not onClick", () => {
    expect(html).toContain('<nav aria-label="Business navigation">');
    const anchors = html.match(/<a href="#(business|services|products|locations|contact|ask)"/g) ?? [];
    expect(anchors.length).toBeGreaterThan(0);
    expect(html).not.toContain("onClick");
  });

  test("one service-detail destination exists", () => {
    const withHref = (plan!.primary === "products" ? plan!.products : plan!.services).some(
      (o) =>
        resolveSafeLink(
          plan!.read(o, "service_href") ?? plan!.read(o, "url"),
          "navigate",
        ).kind === "safe",
    );
    if (withHref) expect(html).toContain("Service details");
  });

  test("Ask FYD degrades to a visible no-JS note", () => {
    if (plan!.ask) {
      expect(html).toContain("<noscript>");
      expect(html).toContain("requires JavaScript");
    }
  });
});
