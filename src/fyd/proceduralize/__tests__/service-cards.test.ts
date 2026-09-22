/**
 * Service lane v2 (2026-09-22): deterministic HTML service-card
 * extraction -> ping.social.service@1 objects + offers edges.
 *
 * Covers:
 * - elementor-cta-services cards (title + description + /services/ link)
 * - estimate-service-card cards (?service=<slug> inside a Services section)
 * - determinism: same bytes twice, reordered cards, duplicated cards
 * - evidence: evidenceDetail carries pattern + selector + byte span;
 *   the offers edge evidenceRef names the detector and card key
 * - claims: name/description/service_href are DIRECT_FACT
 *   website_statement claims, never inflated
 * - negatives: nav-only links and non-services CTAs are not cards
 * - observations: PipelineOutput.fields carries the card facts for
 *   per-observation persistence
 * - Ask FYD: the fixed services question answers card services with
 *   evidence-backed claims
 *
 * Run with: npx jest --config src/fyd/proceduralize/jest.config.cjs service-cards
 */

import { extractServiceCards } from "../service-cards";
import { runExtractionPipeline } from "../proceduralizer";
import type { AcquiredSource } from "../proceduralizer";
import { buildAskContext, composeAnswer } from "../../../lib/ping/ask-composer";
import type { PingObject } from "../../../lib/ping/types";

const SOURCE_URL = "https://cards.test/";
const OBSERVED_AT = "2026-09-22T12:00:00Z";
const CONTROLLER = "service-cards-test";
const QUESTION = "What services does this business offer, and how do you know?";

// Unrelated bytes ingested before the card page: must not shift service ids.
const UNRELATED_HTML =
  "<!doctype html><html><head><title>Other Business</title>" +
  '<meta property="og:title" content="Other Business"/></head><body>' +
  "<h1>Welcome to Other Business</h1><p>We sell widgets.</p>" +
  "</body></html>";

const ELEMENTOR_HTML =
  "<!doctype html><html><head><title>Test Plumbing Co</title></head><body>" +
  "<section>" +
  '<a class="elementor-cta" href="https://cards.test/services/plumbing/">' +
  '<div class="elementor-cta__content">' +
  '<h2 class="elementor-cta__title elementor-cta__content-item">Plumbing</h2>' +
  '<div class="elementor-cta__description elementor-cta__content-item">' +
  "We fix pipes and install fixtures for homes and businesses." +
  "</div></div></a>" +
  '<a class="elementor-cta" href="https://cards.test/services/hvac/">' +
  '<div class="elementor-cta__content">' +
  '<h2 class="elementor-cta__title elementor-cta__content-item">HVAC</h2>' +
  '<div class="elementor-cta__description elementor-cta__content-item">' +
  "Heating and cooling installation and repair for all major makes." +
  "</div></div></a>" +
  // Not a service card: CTA linking outside /services/.
  '<a class="elementor-cta" href="https://cards.test/about/">' +
  '<div class="elementor-cta__content">' +
  '<h2 class="elementor-cta__title">About Us</h2>' +
  '<div class="elementor-cta__description">We are a family business.</div>' +
  "</div></a>" +
  "</section></body></html>";

const ESTIMATE_HTML =
  "<!doctype html><html><head><title>Test Carpentry</title></head><body>" +
  '<section data-slot-section="Services">' +
  '<div data-slot-id="slot-painting"><a class="block" href="/estimate?service=painting">' +
  "<div><h3>Painting</h3>" +
  "<p>Interior and exterior painting with careful prep work included.</p></div>" +
  "</a></div>" +
  '<div data-slot-id="slot-repairs"><a class="block" href="/estimate?service=repairs">' +
  "<div><h3>Repairs</h3>" +
  "<p>Small repairs fixed early before they become big replacements.</p></div>" +
  "</a></div>" +
  "</section>" +
  // Not a card: bare service= link with no title/description and no
  // Services section context.
  '<nav><a href="/estimate?service=painting">Painting</a></nav>' +
  "</body></html>";

async function extract(html: string) {
  return runExtractionPipeline(
    [
      {
        url: SOURCE_URL,
        sourceType: "html",
        discoveredAt: OBSERVED_AT,
        raw: html,
        ok: true,
        status: 200,
      },
    ],
    { sourceUrl: SOURCE_URL, observedAt: OBSERVED_AT, controllerId: CONTROLLER },
  );
}

function servicesOf(objects: PingObject[]): PingObject[] {
  return objects.filter((o) => o.schema === "ping.social.service@1");
}

function businessOf(objects: PingObject[]): PingObject {
  const b = objects.find((o) => o.schema === "ping.social.business@1");
  if (!b) throw new Error("expected a business object");
  return b;
}

describe("extractServiceCards", () => {
  test("elementor CTA service cards carry evidence detail", () => {
    const cards = extractServiceCards(ELEMENTOR_HTML, SOURCE_URL);
    expect(cards.map((c) => c.key).sort()).toEqual(["hvac", "plumbing"]);
    const plumbing = cards.find((c) => c.key === "plumbing");
    if (!plumbing) throw new Error("missing plumbing card");
    expect(plumbing.name).toBe("Plumbing");
    expect(plumbing.description).toBe(
      "We fix pipes and install fixtures for homes and businesses.",
    );
    expect(plumbing.pattern).toBe("elementor-cta-services");
    // Evidence detail names the pattern, the selector, and the byte span.
    expect(plumbing.evidenceDetail).toContain("pattern=elementor-cta-services");
    expect(plumbing.evidenceDetail).toContain(
      'selector=a[href="https://cards.test/services/plumbing/"]',
    );
    const span = /bytes=(\d+)-(\d+)/.exec(plumbing.evidenceDetail);
    if (!span) throw new Error("missing byte span in evidenceDetail");
    const start = parseInt(span[1], 10);
    const end = parseInt(span[2], 10);
    expect(ELEMENTOR_HTML.slice(start, end)).toContain(
      'href="https://cards.test/services/plumbing/"',
    );
    expect(ELEMENTOR_HTML.slice(start, end)).toContain("Plumbing</h2>");
    // The non-/services/ CTA is not a card.
    expect(cards.some((c) => c.name === "About Us")).toBe(false);
  });

  test("estimate service cards require a Services section marker", () => {
    const cards = extractServiceCards(ESTIMATE_HTML, SOURCE_URL);
    expect(cards.map((c) => c.key).sort()).toEqual(["painting", "repairs"]);
    const painting = cards.find((c) => c.key === "painting");
    if (!painting) throw new Error("missing painting card");
    expect(painting.name).toBe("Painting");
    expect(painting.pattern).toBe("estimate-service-card");
    expect(painting.evidenceDetail).toContain("pattern=estimate-service-card");
    // Same card markup without the section marker is not extracted.
    const unmarked = ESTIMATE_HTML.replace('data-slot-section="Services"', "");
    expect(extractServiceCards(unmarked, SOURCE_URL).length).toBe(0);
  });

  test("commented-out cards are not extracted", () => {
    const html =
      "<!-- " +
      '<a class="elementor-cta" href="https://cards.test/services/ghost/">' +
      '<h2 class="elementor-cta__title">Ghost</h2>' +
      '<div class="elementor-cta__description">A commented-out card with enough text.</div>' +
      "</a> -->";
    expect(extractServiceCards(html, SOURCE_URL).length).toBe(0);
  });

  test("output is sorted and deterministic", () => {
    const a = extractServiceCards(ELEMENTOR_HTML, SOURCE_URL);
    const b = extractServiceCards(ELEMENTOR_HTML, SOURCE_URL);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    // Reversed card order in the bytes yields the same keyed set.
    const reversed = ELEMENTOR_HTML.replace(
      /(<a class="elementor-cta" href="https:\/\/cards\.test\/services\/plumbing\/">[\s\S]*?<\/a>)([\s\S]*?)(<a class="elementor-cta" href="https:\/\/cards\.test\/services\/hvac\/">[\s\S]*?<\/a>)/,
      "$3$2$1",
    );
    const c = extractServiceCards(reversed, SOURCE_URL);
    expect(c.map((x) => x.key)).toEqual(a.map((x) => x.key));
    // Reordered cards keep per-card evidence: each card's byte span still
    // slices its own anchor out of the reordered bytes.
    for (const card of c) {
      const span = /bytes=(\d+)-(\d+)/.exec(card.evidenceDetail);
      if (!span) throw new Error("missing byte span");
      const slice = reversed.slice(parseInt(span[1], 10), parseInt(span[2], 10));
      expect(slice).toContain(`href="${card.href}"`);
    }
    // Same bytes in -> byte-identical observations out.
    expect(JSON.stringify(extractServiceCards(reversed, SOURCE_URL))).toBe(
      JSON.stringify(c),
    );
  });
});

describe("service card projection", () => {
  test("cards project to Service objects with offers edges", async () => {
    const { graph } = await extract(ELEMENTOR_HTML);
    const services = servicesOf(graph.objects);
    expect(services.map((s) => s.title).sort()).toEqual(["HVAC", "Plumbing"]);
    const plumbing = services.find((s) => s.title === "Plumbing");
    if (!plumbing) throw new Error("missing Plumbing service");
    expect(plumbing.description).toBe(
      "We fix pipes and install fixtures for homes and businesses.",
    );
    expect(plumbing.fields["service_href"]).toBe(
      "https://cards.test/services/plumbing/",
    );
    expect(plumbing.fields["claimKind"]).toBe("website_statement");
    const fc = graph.fieldClasses?.[plumbing.id];
    expect(fc?.["name"]).toBe("DIRECT_FACT");
    expect(fc?.["description"]).toBe("DIRECT_FACT");
    expect(fc?.["service_href"]).toBe("DIRECT_FACT");
    expect(fc?.["claimKind"]).toBe("DIRECT_FACT");
    expect(plumbing.provenance.kind).toBe("website-derived");
    // Business offers edge with a detector-named evidence ref.
    const business = businessOf(graph.objects);
    const offersRels = graph.relationships.filter(
      (r) =>
        r.subject === business.id &&
        r.predicate === "offers" &&
        r.object === plumbing.id,
    );
    expect(offersRels.length).toBe(1);
    expect(offersRels[0].evidenceRef).toBe(
      "proceduralizer:project:service-card:elementor-cta-services:plumbing",
    );
  });

  test("estimate cards project the same way", async () => {
    const { graph } = await extract(ESTIMATE_HTML);
    const services = servicesOf(graph.objects);
    expect(services.map((s) => s.title).sort()).toEqual(["Painting", "Repairs"]);
    const business = businessOf(graph.objects);
    const provided = new Set(
      graph.relationships
        .filter((r) => r.subject === business.id && r.predicate === "offers")
        .map((r) => r.object),
    );
    for (const s of services) expect(provided.has(s.id)).toBe(true);
  });

  test("duplicate card markup projects one service", async () => {
    const doubled = ELEMENTOR_HTML + ELEMENTOR_HTML;
    const { graph } = await extract(doubled);
    expect(servicesOf(graph.objects).length).toBe(2);
  });

  test("service ids are stable across runs and card order", async () => {
    const first = await extract(ELEMENTOR_HTML);
    const second = await extract(ELEMENTOR_HTML);
    const ids = (g: typeof first.graph) =>
      servicesOf(g.objects)
        .map((s) => s.id)
        .sort();
    expect(ids(second.graph)).toEqual(ids(first.graph));
  });

  test("observations persist the card facts with evidence", async () => {
    const { fields } = await extract(ELEMENTOR_HTML);
    const cardFacts = fields.filter((f) => f.name.startsWith("service_card_"));
    expect(cardFacts.length).toBe(6); // 2 cards x name/description/href
    for (const f of cardFacts) {
      expect(f.sourceType).toBe("html");
      expect(f.factClass).toBe("DIRECT_FACT");
      expect(f.entityId ?? "").toMatch(/^service-card:/);
      expect(f.evidenceDetail ?? "").toContain("bytes=");
    }
  });
});

describe("ask fyd over card services", () => {
  test("the fixed services question answers card services with evidence", async () => {
    const { graph } = await extract(ELEMENTOR_HTML);
    const business = businessOf(graph.objects);
    const services = servicesOf(graph.objects);
    const ctx = buildAskContext({
      viewer: { id: null, displayName: null },
      target: business,
      relatedObjects: services,
      relationships: graph.relationships,
      plan: null,
      fieldClasses: graph.fieldClasses ?? {},
    });
    const answer = composeAnswer(ctx, QUESTION);
    expect(answer.answer).toContain("Plumbing");
    expect(answer.answer).toContain("HVAC");
    expect(answer.unknowns).toEqual([]);
    expect(answer.sourceUrls).toEqual([SOURCE_URL]);
    for (const c of answer.claimClassifications) {
      expect(c.evidenceRefIds.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("deterministic service ids", () => {
  // Directive 2026-09-22: ids derive from stable semantic inputs only
  // (tenant + normalized source label + source evidence pointer). The same
  // semantic service must get the same id across extraction order, module
  // reload (fresh process state), and unrelated prior ingestion.
  test("same semantic service -> same id across order, reload, and prior ingestion", async () => {
    const idsOf = (objects: { id: string; schema: string; title?: string }[]) =>
      objects
        .filter((o) => o.schema === "ping.social.service@1")
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((o) => o.id + "::" + (o.title ?? ""));

    // 1. Baseline extraction order.
    const base = idsOf((await extract(ELEMENTOR_HTML)).graph.objects);

    // 2. Different extraction order (cards appear reversed in the bytes).
    const reversedHtml = ELEMENTOR_HTML.replace(
      /(<a class="elementor-cta" href="https:\/\/cards\.test\/services\/plumbing\/">[\s\S]*?<\/a>)([\s\S]*?)(<a class="elementor-cta" href="https:\/\/cards\.test\/services\/hvac\/">[\s\S]*?<\/a>)/,
      "$3$2$1",
    );
    const reordered = idsOf((await extract(reversedHtml)).graph.objects);
    expect(reordered).toEqual(base);

    // 3. Unrelated prior ingestion in the same process first.
    await extract(UNRELATED_HTML);
    const afterPrior = idsOf((await extract(ELEMENTOR_HTML)).graph.objects);
    expect(afterPrior).toEqual(base);

    // 4. Fresh module state (simulates a different process: no shared
    //    module-level state may feed the ids).
    jest.resetModules();
    const fresh = require("../proceduralizer") as typeof import("../proceduralizer");
    const freshAcquired: AcquiredSource[] = [
      {
        url: SOURCE_URL,
        sourceType: "html",
        discoveredAt: OBSERVED_AT,
        raw: ELEMENTOR_HTML,
        ok: true,
        status: 200,
      },
    ];
    const freshRun = await fresh.runExtractionPipeline(freshAcquired, {
      sourceUrl: SOURCE_URL,
      observedAt: OBSERVED_AT,
      controllerId: CONTROLLER,
    });
    expect(idsOf(freshRun.graph.objects)).toEqual(base);
  });
});

describe("observation semantics", () => {
  test("card observations carry extractor, selector, and byte span", async () => {
    const { fields } = await extract(ELEMENTOR_HTML);
    const names = fields.filter((f) => f.name === "service_card_name");
    expect(names.length).toBeGreaterThan(0);
    for (const f of names) {
      expect(f.extractor).toBe("service-cards@2026-09-22");
      expect(f.sourceUrl).toBe(SOURCE_URL);
      expect(f.observedAt).toBe(OBSERVED_AT);
      expect(f.evidenceDetail ?? "").toContain("selector=");
      expect(f.evidenceDetail ?? "").toContain("bytes=");
      expect(f.evidenceRef ?? "").toMatch(/^web:[0-9a-f]{12}$/);
    }
  });

  test("service name is the source label verbatim; no normalized overwrite", async () => {
    const { graph } = await extract(ELEMENTOR_HTML);
    const services = servicesOf(graph.objects);
    const titles = services.map((o) => o.title);
    expect(titles).toContain("Plumbing");
    expect(titles).toContain("HVAC");
    // Verbatim label AND description: the owner's language is preserved.
    const plumbing = services.find((o) => o.title === "Plumbing");
    expect(String(plumbing?.fields["description"] ?? "")).toBe(
      "We fix pipes and install fixtures for homes and businesses.",
    );
    // No normalized classification field is written over the label.
    for (const o of services) {
      expect(o.fields["service_category"]).toBeUndefined();
      expect(o.fields["normalized_name"]).toBeUndefined();
    }
  });
});
