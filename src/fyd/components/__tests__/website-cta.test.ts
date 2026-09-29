/**
 * PROD-11: website CTA dedup + domain labeling on the site page.
 *
 * The site page rendered "Visit website" twice (hero + CTA section), a
 * template artifact. Fix: the hero owns the single website CTA and the
 * label names the domain ("Visit happy-place-platform.vercel.app");
 * CTASection renders only Ask FYD.
 *
 * Run: npx jest --config src/fyd/components/jest.config.cjs website-cta
 */

import { renderToStaticMarkup } from "react-dom/server";
import { SitePageView } from "../renderer";
import { HAPPY_PLACE_RICH_GRAPH } from "../../proceduralize/__fixtures__/happy-place-rich-graph";
import { generateSiteSpec } from "../../proceduralize/generator";
import type { ObjectGraph } from "../../sitespec/types";

const WEBSITE = "https://happy-place-platform.vercel.app/";
const DOMAIN = "happy-place-platform.vercel.app";
const GEN_OPTS = {
  generatedAt: "2026-09-21T12:00:00.000Z",
  eventSequences: [65, 83],
} as const;

function renderHome(graph: ObjectGraph): string {
  const spec = generateSiteSpec(graph, { ...GEN_OPTS });
  const ctx = {
    spec,
    graph,
    viewer: { viewerId: null, displayName: null },
  };
  const page = spec.pages.find((p) => p.slug === "home");
  expect(page).toBeDefined();
  return renderToStaticMarkup(SitePageView({ page: page!, ctx }));
}

function heroMarkup(body: string): string {
  const marker = body.indexOf('data-motion="hero-settle"');
  expect(marker).toBeGreaterThan(-1);
  const open = body.lastIndexOf("<section", marker);
  const close = body.indexOf("</section>", marker);
  expect(close).toBeGreaterThan(open);
  return body.slice(open, close);
}

describe("website CTA dedup (PROD-11)", () => {
  test("exactly one website CTA in visible text on the site page", () => {
    const body = renderHome(HAPPY_PLACE_RICH_GRAPH);
    const matches = body.match(/Visit happy-place-platform\.vercel\.app/g) || [];
    expect(matches).toHaveLength(1);
  });

  test("hero website CTA label names the domain", () => {
    const hero = heroMarkup(renderHome(HAPPY_PLACE_RICH_GRAPH));
    expect(hero).toContain(`Visit ${DOMAIN}`);
    expect(hero).not.toContain("Visit website");
  });

  test("hero website CTA href is the verified website URL", () => {
    const hero = heroMarkup(renderHome(HAPPY_PLACE_RICH_GRAPH));
    expect(hero).toContain(`href="${WEBSITE}"`);
  });

  test("website link is not removed entirely", () => {
    const body = renderHome(HAPPY_PLACE_RICH_GRAPH);
    // The hero CTA plus the Contact/Links section rows all point at the
    // verified URL; dedup must not nuke the link itself.
    expect(body.match(new RegExp(`href="${WEBSITE.replace(/\./g, "\\.")}"`, "g"))!.length).toBeGreaterThanOrEqual(1);
  });

  test("CTA section renders no website button", () => {
    const body = renderHome(HAPPY_PLACE_RICH_GRAPH);
    const marker = body.indexOf("Start the conversation");
    expect(marker).toBeGreaterThan(-1);
    const section = body.slice(marker, body.indexOf("</section>", marker));
    expect(section).not.toContain("Visit");
    expect(section).toContain("Ask FYD");
  });
});
