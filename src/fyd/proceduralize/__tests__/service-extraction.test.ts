/**
 * Service extraction lane (2026-09-21): Tier 1 JSON-LD Service/Offer
 * extraction -> Service objects + relationships -> Ask FYD.
 *
 * Covers:
 * - direct @type: Service (with serviceType, provider, areaServed)
 * - Service.offers, Offer.itemOffered -> Service
 * - Organization.makesOffer -> Offer -> Service
 * - hasOfferCatalog -> OfferCatalog -> Offer -> itemOffered -> Service
 * - deterministic Service IDs (reordered nodes, unrelated ingestion first)
 * - Ask FYD exact question: evidence-backed answer, claim classifications,
 *   source URLs; frozen refusal + named unknown when no services exist
 */

import { runExtractionPipeline } from "../proceduralizer";
import { buildAskContext, composeAnswer } from "../../../lib/ping/ask-composer";
import type { PingObject } from "../../../lib/ping/types";

const SOURCE_URL = "https://example.test/";
const OBSERVED_AT = "2026-09-21T12:00:00Z";
const CONTROLLER = "service-extraction-test";
const QUESTION = "What services does this business offer, and how do you know?";

function htmlDoc(jsonLd: unknown): string {
  return (
    "<!doctype html><html><head><title>Acme Test Plumbing</title>" +
    '<script type="application/ld+json">' +
    JSON.stringify(jsonLd) +
    "</script></head><body></body></html>"
  );
}

function servicesJsonLd(graph: unknown[]): unknown {
  return { "@context": "https://schema.org", "@graph": graph };
}

const BUSINESS_NODE = {
  "@type": "LocalBusiness",
  "@id": "https://example.test/#business",
  name: "Acme Test Plumbing",
  makesOffer: {
    "@type": "Offer",
    name: "Emergency Plumbing Offer",
    itemOffered: {
      "@type": "Service",
      name: "Emergency Plumbing",
      serviceType: "Plumbing",
      areaServed: "Test County",
      provider: { "@id": "https://example.test/#business" },
    },
  },
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Service Catalog",
    itemListElement: [
      {
        "@type": "Offer",
        itemOffered: { "@type": "Service", name: "Drain Cleaning" },
      },
    ],
  },
};

const STANDALONE_SERVICE = {
  "@type": "Service",
  name: "Water Heater Install",
  description: "Install water heaters.",
};

async function extract(
  jsonLd: unknown,
  sourceType: "json-ld" | "html" = "json-ld",
) {
  // Contract (parseRich): sourceType "json-ld" means raw IS the JSON-LD
  // payload; "html" means raw is a full page the extractor scrapes.
  const raw = sourceType === "json-ld" ? JSON.stringify(jsonLd) : htmlDoc(jsonLd);
  return runExtractionPipeline(
    [
      {
        url: SOURCE_URL,
        sourceType,
        discoveredAt: OBSERVED_AT,
        raw,
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

function offersOf(objects: PingObject[]): PingObject[] {
  return objects.filter((o) => o.schema === "ping.social.offer@1");
}

function businessOf(objects: PingObject[]): PingObject {
  const b = objects.find((o) => o.schema === "ping.social.business@1");
  if (!b) throw new Error("expected a business object");
  return b;
}

describe("service extraction", () => {
  test("direct Service nodes project with service_type and area_served", async () => {
    const { graph } = await extract(
      servicesJsonLd([BUSINESS_NODE, STANDALONE_SERVICE]),
    );
    const services = servicesOf(graph.objects);
    expect(services.map((s) => s.title).sort()).toEqual([
      "Drain Cleaning",
      "Emergency Plumbing",
      "Water Heater Install",
    ]);
    const emergency = services.find((s) => s.title === "Emergency Plumbing");
    if (!emergency) throw new Error("missing Emergency Plumbing");
    expect(emergency.fields["service_type"]).toBe("Plumbing");
    expect(emergency.fields["area_served"]).toBe("Test County");
    const fc = graph.fieldClasses?.[emergency.id];
    expect(fc?.["name"]).toBe("DIRECT_FACT");
    expect(fc?.["service_type"]).toBe("DIRECT_FACT");
    expect(fc?.["area_served"]).toBe("DIRECT_FACT");
  });

  test("Offer nodes project and chain Business makes_offer Offer item_offered Service", async () => {
    const { graph } = await extract(
      servicesJsonLd([BUSINESS_NODE, STANDALONE_SERVICE]),
    );
    const offers = offersOf(graph.objects);
    expect(offers.length).toBe(2);
    const offerNames = offers.map((o) => o.title).sort();
    expect(offerNames).toContain("Emergency Plumbing Offer");
    // The catalog offer has no source name: its fallback label is
    // DERIVED_FACT in the graph's field classes, never a direct fact.
    const catalogOffer = offers.find((o) => o.title === "Offer");
    if (!catalogOffer) throw new Error("missing catalog offer");
    expect(graph.fieldClasses?.[catalogOffer.id]?.["name"]).toBe("DERIVED_FACT");

    const business = businessOf(graph.objects);
    const rels = graph.relationships;
    const makesOffer = rels.filter(
      (r) => r.subject === business.id && r.predicate === "makes_offer",
    );
    expect(makesOffer.length).toBeGreaterThanOrEqual(1);
    const itemOffered = rels.filter((r) => r.predicate === "item_offered");
    expect(itemOffered.length).toBe(2);
    // every item_offered object is a Service object
    const serviceIds = new Set(servicesOf(graph.objects).map((s) => s.id));
    for (const r of itemOffered) expect(serviceIds.has(r.object)).toBe(true);
  });

  test("provider edge projects Service provided_by Business", async () => {
    const { graph } = await extract(
      servicesJsonLd([BUSINESS_NODE, STANDALONE_SERVICE]),
    );
    const business = businessOf(graph.objects);
    const emergency = servicesOf(graph.objects).find(
      (s) => s.title === "Emergency Plumbing",
    );
    if (!emergency) throw new Error("missing Emergency Plumbing");
    const providedBy = graph.relationships.filter(
      (r) =>
        r.subject === emergency.id &&
        r.predicate === "provided_by" &&
        r.object === business.id,
    );
    expect(providedBy.length).toBe(1);
  });

  test("business offers edge reaches every Service", async () => {
    const { graph } = await extract(
      servicesJsonLd([BUSINESS_NODE, STANDALONE_SERVICE]),
    );
    const business = businessOf(graph.objects);
    const offered = new Set(
      graph.relationships
        .filter((r) => r.subject === business.id && r.predicate === "offers")
        .map((r) => r.object),
    );
    for (const s of servicesOf(graph.objects)) expect(offered.has(s.id)).toBe(true);
  });

  test("full html pages extract the same services through the html path", async () => {
    const { graph } = await extract(
      servicesJsonLd([BUSINESS_NODE, STANDALONE_SERVICE]),
      "html",
    );
    expect(servicesOf(graph.objects).map((s) => s.title).sort()).toEqual([
      "Drain Cleaning",
      "Emergency Plumbing",
      "Water Heater Install",
    ]);
    expect(offersOf(graph.objects).length).toBe(2);
  });

  test("service ids are deterministic across node reorder and unrelated ingestion", async () => {    const first = await extract(servicesJsonLd([BUSINESS_NODE, STANDALONE_SERVICE]));
    const firstIds = servicesOf(first.graph.objects)
      .map((s) => s.id)
      .sort();

    // reversed @graph order
    const reversed = await extract(
      servicesJsonLd([STANDALONE_SERVICE, BUSINESS_NODE]),
    );
    const reversedIds = servicesOf(reversed.graph.objects)
      .map((s) => s.id)
      .sort();
    expect(reversedIds).toEqual(firstIds);

    // unrelated business ingested first in the same process
    await extract(
      servicesJsonLd([
        {
          "@type": "LocalBusiness",
          name: "Unrelated Widgets LLC",
          url: "https://unrelated.test/",
        },
      ]),
    );
    const third = await extract(servicesJsonLd([BUSINESS_NODE, STANDALONE_SERVICE]));
    const thirdIds = servicesOf(third.graph.objects)
      .map((s) => s.id)
      .sort();
    expect(thirdIds).toEqual(firstIds);
  });
});

describe("ask fyd services question", () => {
  test("evidence-backed answer with claim classifications and source urls", async () => {
    const { graph } = await extract(
      servicesJsonLd([BUSINESS_NODE, STANDALONE_SERVICE]),
    );
    const business = businessOf(graph.objects);
    const services = servicesOf(graph.objects);
    const offers = offersOf(graph.objects);
    const ctx = buildAskContext({
      viewer: { id: null, displayName: null },
      target: business,
      relatedObjects: [...services, ...offers],
      relationships: graph.relationships,
      plan: null,
      fieldClasses: graph.fieldClasses ?? {},
    });
    const answer = composeAnswer(ctx, QUESTION);

    expect(answer.partial).toBe(false);
    expect(answer.answer).toContain("Emergency Plumbing");
    expect(answer.answer).toContain("Drain Cleaning");
    expect(answer.answer).toContain("Water Heater Install");
    // Offer nodes are evidence-chain scaffolding, not services: the
    // answer must not present them as offered services.
    expect(answer.answer).not.toContain("Emergency Plumbing Offer");
    expect(answer.unknowns).toEqual([]);
    expect(answer.sourceUrls).toEqual(["https://example.test/"]);

    // Exactly the claims the answer states: the 3 named services.
    expect(answer.claimClassifications.length).toBe(3);
    for (const c of answer.claimClassifications) {
      expect(c.classification).toBe("DIRECT_FACT");
      expect(c.evidenceRefIds.length).toBeGreaterThanOrEqual(1);
    }
    expect(answer.evidenceRefs.length).toBeGreaterThanOrEqual(5);
    expect(answer.evidenceRefs.length).toBeGreaterThanOrEqual(3);
  });

  test("no services means frozen refusal and a named unknown, not a guess", async () => {
    const { graph } = await extract(
      servicesJsonLd([
        {
          "@type": "LocalBusiness",
          name: "Acme Test Plumbing",
          url: "https://example.test/",
        },
      ]),
    );
    const business = businessOf(graph.objects);
    expect(servicesOf(graph.objects).length).toBe(0);
    const ctx = buildAskContext({
      viewer: { id: null, displayName: null },
      target: business,
      relatedObjects: [],
      relationships: graph.relationships,
      plan: null,
      fieldClasses: graph.fieldClasses ?? {},
    });
    const answer = composeAnswer(ctx, QUESTION);

    expect(answer.partial).toBe(true);
    // The frozen refusal sentence leads; the composer appends the
    // consulted-context line, which is not part of the frozen wording.
    expect(answer.answer.startsWith(
      "I do not have evidence for that in the current context, so I will not guess.",
    )).toBe(true);
    expect(answer.unknowns).toEqual(["services offered by this business"]);
    expect(answer.claimClassifications).toEqual([]);
    expect(answer.sourceUrls).toEqual(["https://example.test/"]);
  });
});
