/**
 * Hero contact-discoverability tests (2026-09-24, contact-invisibility lane).
 *
 * The business phone must be visible and actionable in the hero on every
 * viewport. The old ISSUE-3 logic coupled the dial affordance to
 * website.kind === "safe" and wrapped it in md:hidden, so no phone number
 * appeared in the desktop hero. The fix decouples the phone CTA from the
 * website gate and drops the viewport gate: phoneMethod is already
 * binding-verified and safety-gated through contactMethodFor, so an
 * unverifiable or unsafe number renders nothing and nothing is invented.
 * The affordance opens the FYD contact flow (value + provenance + the real
 * Call action inside), never a raw tel: link at top level.
 *
 * Run: npx jest --config src/fyd/components/jest.config.cjs hero-contact
 */

import { renderToStaticMarkup } from "react-dom/server";
import { SitePageView } from "../renderer";
import { HAPPY_PLACE_RICH_GRAPH } from "../../proceduralize/__fixtures__/happy-place-rich-graph";
import { generateSiteSpec } from "../../proceduralize/generator";
import type { ObjectGraph } from "../../sitespec/types";

const PHONE = "+15412865190";
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

/**
 * The hero section's static markup. ClaimBadge renders a span, never a
 * nested section, so the first </section> after the hero marker closes it.
 */
function heroMarkup(body: string): string {
  const marker = body.indexOf('data-motion="hero-settle"');
  expect(marker).toBeGreaterThan(-1);
  const open = body.lastIndexOf("<section", marker);
  const close = body.indexOf("</section>", marker);
  expect(close).toBeGreaterThan(open);
  return body.slice(open, close);
}

/** A tenant with no binding-verified phone: every phone field removed. */
function stripPhone(graph: ObjectGraph): ObjectGraph {
  const clone = JSON.parse(JSON.stringify(graph)) as ObjectGraph;
  for (const o of clone.objects) {
    const fields = o.fields as Record<string, unknown> | undefined;
    if (fields) delete fields["phone"];
  }
  return clone;
}

describe("hero contact discoverability", () => {
  test("phone CTA renders in the hero with no viewport gate", () => {
    const hero = heroMarkup(renderHome(HAPPY_PLACE_RICH_GRAPH));
    // The FYD contact affordance for the phone is present in the hero.
    expect(hero).toContain('data-fyd-contact="phone"');
    // The value is actionable (a disclosure toggle), not dead text.
    expect(hero).toContain(`Call ${PHONE}`);
    // Desktop is no longer excluded: no md:hidden anywhere in the hero.
    expect(hero).not.toContain("md:hidden");
  });

  test("CTA order is Call, then Visit <domain>, then Ask FYD", () => {
    const hero = heroMarkup(renderHome(HAPPY_PLACE_RICH_GRAPH));
    const callAt = hero.indexOf(`Call ${PHONE}`);
    const visitAt = hero.indexOf("Visit happy-place-platform.vercel.app");
    const askAt = hero.indexOf("Ask FYD");
    expect(callAt).toBeGreaterThan(-1);
    expect(visitAt).toBeGreaterThan(-1);
    expect(askAt).toBeGreaterThan(-1);
    expect(callAt).toBeLessThan(visitAt);
    expect(visitAt).toBeLessThan(askAt);
  });

  test("the only tel: in the hero lives inside the contact flow", () => {
    const hero = heroMarkup(renderHome(HAPPY_PLACE_RICH_GRAPH));
    const flowAt = hero.indexOf('data-fyd-contact-flow="phone"');
    const telAt = hero.indexOf('href="tel:');
    expect(flowAt).toBeGreaterThan(-1);
    expect(telAt).toBeGreaterThan(-1);
    // The dial action sits inside the FYD contact flow; no tel: href
    // exists at top level on the generated surface.
    expect(telAt).toBeGreaterThan(flowAt);
    expect(hero.indexOf('href="tel:', telAt + 1)).toBe(-1);
  });

  test("no binding-verified phone renders no phone CTA (nothing invented)", () => {
    const hero = heroMarkup(renderHome(stripPhone(HAPPY_PLACE_RICH_GRAPH)));
    expect(hero).not.toContain('data-fyd-contact="phone"');
    expect(hero).not.toContain(PHONE);
    // The remaining CTAs still render.
    expect(hero).toContain("Visit happy-place-platform.vercel.app");
    expect(hero).toContain("Ask FYD");
  });

  test("hero render is deterministic", () => {
    const a = renderHome(HAPPY_PLACE_RICH_GRAPH);
    const b = renderHome(HAPPY_PLACE_RICH_GRAPH);
    expect(a).toBe(b);
  });
});
