/**
 * PROD-2 (2026-09-27): Emergency Services section contact action and
 * claim reconciliation.
 *
 * 1. REAL CTA: the Emergency Services section copy invites contact
 *    ("get in touch"), so the section must carry a real, visible tel:
 *    link with the business's verified phone number, adjacent to the
 *    copy, without scrolling to another section. The number is never
 *    hardcoded: it flows through the same binding-verified ContactMethod
 *    projection as every other contact affordance. Fail-closed: no
 *    verifiable phone means no CTA.
 * 2. CLAIM RECONCILIATION: the section copy must not claim 24/7 or
 *    guaranteed emergency service, because Ask FYD's evidence-backed
 *    answer is "no emergency service is on record" (pinned in
 *    ask-support-classes.test.ts). The reconciled copy below is the
 *    honest form.
 *
 * Run: npx jest --config src/fyd/components/jest.config.cjs emergency-services-cta
 */

import { renderToStaticMarkup } from "react-dom/server";
import { renderSection } from "../renderer";
import { HAPPY_PLACE_RICH_GRAPH } from "../../proceduralize/__fixtures__/happy-place-rich-graph";
import { generateSiteSpec } from "../../proceduralize/generator";
import type {
  FYDSection,
  ObjectGraph,
  ViewerContext,
} from "../../sitespec/types";

const PHONE = "+15412865190";
// Reconciled copy (PROD-2): honest about urgent repairs, no 24/7 or
// guaranteed-response claim, matching Ask FYD's "no emergency service
// is on record" answer.
const COPY = "For urgent repairs, call us and we will do our best.";

const GEN_OPTS = {
  generatedAt: "2026-09-21T12:00:00.000Z",
  eventSequences: [65, 83],
} as const;

const SERVICE_IDS = [
  "object_fdce5190ab155923",
  "object_587e260b409b2de9",
  "object_50fec066de21d77b",
  "object_daa1ea29cd83240b",
];

function ctxFor(graph: ObjectGraph) {
  const spec = generateSiteSpec(graph, { ...GEN_OPTS });
  const viewer: ViewerContext = { viewerId: null, displayName: null };
  return { spec, graph, viewer };
}

function emergencySection(): FYDSection {
  return {
    id: "home:Services:2",
    component: "Services",
    query: { kind: "reference", objectIds: SERVICE_IDS },
    presentation: { heading: "Emergency Services", copy: COPY },
  };
}

/** The section's own static markup (no nested sections inside). */
function sectionMarkup(body: string): string {
  const marker = body.indexOf("Emergency Services");
  expect(marker).toBeGreaterThan(-1);
  const open = body.lastIndexOf("<section", marker);
  const close = body.indexOf("</section>", marker);
  expect(close).toBeGreaterThan(open);
  return body.slice(open, close);
}

function renderEmergency(graph: ObjectGraph): string {
  const ctx = ctxFor(graph);
  const node = renderSection(emergencySection(), ctx, 0);
  expect(node).not.toBeNull();
  return sectionMarkup(renderToStaticMarkup(node));
}

/** A graph with every phone field removed: nothing verifiable to dial. */
function stripPhone(graph: ObjectGraph): ObjectGraph {
  const clone = JSON.parse(JSON.stringify(graph)) as ObjectGraph;
  for (const o of clone.objects) {
    const fields = o.fields as Record<string, unknown> | undefined;
    if (fields) delete fields["phone"];
  }
  return clone;
}

describe("emergency services section CTA", () => {
  test("section carries a working tel: link with the business number", () => {
    const section = renderEmergency(HAPPY_PLACE_RICH_GRAPH);
    expect(section).toContain(`href="tel:${PHONE}"`);
    expect(section).toContain(`Call ${PHONE}`);
  });

  test("tel: CTA sits in the section, adjacent to the copy", () => {
    const section = renderEmergency(HAPPY_PLACE_RICH_GRAPH);
    const copyAt = section.indexOf(COPY);
    const telAt = section.indexOf(`href="tel:${PHONE}"`);
    expect(copyAt).toBeGreaterThan(-1);
    expect(telAt).toBeGreaterThan(-1);
    // The CTA is in the same section, right after the copy block.
    expect(telAt).toBeGreaterThan(copyAt);
  });

  test("no verifiable phone renders no CTA (nothing invented)", () => {
    const section = renderEmergency(stripPhone(HAPPY_PLACE_RICH_GRAPH));
    expect(section).not.toContain("tel:");
    expect(section).not.toContain(PHONE);
    // The section itself still renders.
    expect(section).toContain("Emergency Services");
  });

  test("render is deterministic", () => {
    const a = renderEmergency(HAPPY_PLACE_RICH_GRAPH);
    const b = renderEmergency(HAPPY_PLACE_RICH_GRAPH);
    expect(a).toBe(b);
  });
});

describe("emergency services section claim reconciliation", () => {
  test("copy makes no 24/7 or guaranteed-response claim", () => {
    const section = renderEmergency(HAPPY_PLACE_RICH_GRAPH);
    expect(section).not.toMatch(/24\/7/);
    expect(section).not.toMatch(/guaranteed/i);
    expect(section).not.toMatch(/around the clock/i);
  });
});
