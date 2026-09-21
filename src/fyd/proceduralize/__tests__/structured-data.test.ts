/**
 * Structured-data extraction tests: the 10 locked fixtures through
 * discover -> expand -> entity candidates -> fact extraction.
 *
 * Every assertion is about semantics, never dot paths: @graph envelopes,
 * @id references, multi-type nodes, nested objects, sameAs, and malformed
 * blocks. Grill 7 (fact class) and Grill 19 (visibility) are asserted on
 * every emitted fact.
 */

import {
  discoverStructuredData,
  expandJsonLdBlocks,
  entityCandidates,
  extractStructuredData,
  selectPrimaryBusiness,
  type ParsedFact,
} from "../structured-data";
import {
  ALL_STRUCTURED_FIXTURES,
  FIXTURE_ORG_SIMPLE,
  FIXTURE_LOCAL_BUSINESS,
  FIXTURE_GRAPH_ORG_WEBSITE,
  FIXTURE_NESTED_POSTAL_ADDRESS,
  FIXTURE_SAME_AS,
  FIXTURE_MULTI_TYPE,
  FIXTURE_ID_REFERENCES,
  FIXTURE_SERVICE_PRODUCT,
  FIXTURE_MALFORMED,
} from "../__fixtures__/fixtures-structured";
import { COPPERSMITH_JSONLD_HTML } from "../__fixtures__/coppersmith-jsonld";

const CTX = { sourceUrl: "https://acme.example.com/", observedAt: "2026-09-21T12:00:00.000Z" };

function fact(facts: ParsedFact[], name: string): ParsedFact | undefined {
  return facts.find((f) => f.name === name);
}

describe("structured-data discovery", () => {
  test("finds JSON-LD blocks and flags malformed ones without throwing", () => {
    const blocks = discoverStructuredData(FIXTURE_MALFORMED.html);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].ok).toBe(false);
    expect(blocks[0].error).toBeTruthy();
    expect(blocks[1].ok).toBe(true);
  });
});

describe("locked fixtures", () => {
  test("every emitted fact carries a fact class and a visibility tag", async () => {
    for (const fx of ALL_STRUCTURED_FIXTURES) {
      const ex = await extractStructuredData(fx.html, CTX);
      for (const f of ex.facts) {
        expect(["DIRECT_FACT", "DERIVED_FACT", "INFERENCE", "GENERATED_COPY", "USER_OVERRIDE"]).toContain(f.factClass);
        expect(["public", "private"]).toContain(f.visibility);
        expect(f.sourceType).toBe("json-ld");
        expect(f.inferred).toBe(false);
      }
    }
  });

  test("1. simple Organization: telephone used verbatim, no LLM", async () => {
    const ex = await extractStructuredData(FIXTURE_ORG_SIMPLE.html, CTX);
    expect(fact(ex.facts, "title")?.value).toBe("Acme Services");
    expect(fact(ex.facts, "phone")?.value).toBe("970-555-0100");
    expect(fact(ex.facts, "email")?.value).toBe("hello@acme-services.example.com");
    expect(fact(ex.facts, "phone")?.factClass).toBe("DIRECT_FACT");
    expect(ex.entities).toHaveLength(1);
    expect(ex.entities[0].types).toEqual(["Organization"]);
    expect(selectPrimaryBusiness(ex.entities, byEntity(ex.facts), CTX.sourceUrl)).toBe(ex.entities[0].key);
  });

  test("2. LocalBusiness: structured address fields, price range, area served", async () => {
    const ex = await extractStructuredData(FIXTURE_LOCAL_BUSINESS.html, CTX);
    expect(fact(ex.facts, "phone")?.value).toBe("+19705550100");
    expect(fact(ex.facts, "price_range")?.value).toBe("$$");
    expect(fact(ex.facts, "area_served")?.value).toBe("Mesa County, Colorado");
    const locality = fact(ex.facts, "address_locality");
    expect(locality?.value).toBe("Grand Junction");
    expect(locality?.visibility).toBe("public");
    // The nested PostalAddress is its own entity; nothing is dot-flattened.
    const addrEntity = ex.entities.find((e) => e.types.includes("PostalAddress"));
    expect(addrEntity).toBeTruthy();
    expect(locality?.entityId).toBe(addrEntity?.key);
  });

  test("3. @graph Organization+WebSite: every node visited, publisher reference resolved", async () => {
    const ex = await extractStructuredData(FIXTURE_GRAPH_ORG_WEBSITE.html, CTX);
    expect(ex.stats.nodesVisited).toBe(2);
    expect(ex.stats.nodeIds).toEqual([
      "https://acme.example.com/#organization",
      "https://acme.example.com/#website",
    ]);
    const rel = ex.relationships.find((r) => r.property === "publisher");
    expect(rel?.predicate).toBe("published_by");
    expect(rel?.subjectKey).toBe("https://acme.example.com/#website");
    expect(rel?.objectKey).toBe("https://acme.example.com/#organization");
  });

  test("4. nested PostalAddress: streetAddress classified private and withheld", async () => {
    const ex = await extractStructuredData(FIXTURE_NESTED_POSTAL_ADDRESS.html, CTX);
    const street = fact(ex.facts, "street_address");
    expect(street?.value).toBe("123 Main St");
    expect(street?.visibility).toBe("private");
    expect(street?.factClass).toBe("DIRECT_FACT");
    expect(ex.stats.privateFactsWithheld).toBeGreaterThanOrEqual(1);
    // Coarse fields stay public.
    expect(fact(ex.facts, "address_locality")?.visibility).toBe("public");
  });

  test("5. sameAs[]: every URL is a fact with evidence", async () => {
    const ex = await extractStructuredData(FIXTURE_SAME_AS.html, CTX);
    const socials = fact(ex.facts, "socials");
    expect(socials?.value).toEqual([
      "https://www.facebook.com/acmeservices",
      "https://www.instagram.com/acmeservices",
      "https://www.yelp.com/biz/acme-services",
    ]);
    expect(socials?.property).toBe("sameAs");
  });

  test("6. multiple @type values are all kept, sorted", async () => {
    const ex = await extractStructuredData(FIXTURE_MULTI_TYPE.html, CTX);
    expect(ex.entities).toHaveLength(1);
    expect(ex.entities[0].types).toEqual(["Organization", "Plumber"]);
  });

  test("7. @id references become typed relationships, not strings", async () => {
    const ex = await extractStructuredData(FIXTURE_ID_REFERENCES.html, CTX);
    expect(ex.stats.nodesVisited).toBe(6); // place, org, webpage, website, person, address(blank)
    const pred = (p: string) => ex.relationships.filter((r) => r.predicate === p);
    expect(pred("located_at")).toHaveLength(1);
    expect(pred("about")).toHaveLength(1);
    expect(pred("part_of")).toHaveLength(1);
    expect(pred("authored_by")).toHaveLength(1);
    expect(pred("works_for")).toHaveLength(1);
    expect(pred("has_address")).toHaveLength(1);
    // No relationship points at a blank-node allocation label.
    for (const r of ex.relationships) {
      expect(r.subjectKey.startsWith("_:")).toBe(false);
      expect(r.objectKey.startsWith("_:")).toBe(false);
    }
  });

  test("8. Service and Product entities are candidates", async () => {
    const ex = await extractStructuredData(FIXTURE_SERVICE_PRODUCT.html, CTX);
    expect(ex.entities.some((e) => e.types.includes("Service"))).toBe(true);
    expect(ex.entities.some((e) => e.types.includes("Product"))).toBe(true);
    const svc = ex.entities.find((e) => e.types.includes("Service"))!;
    const rel = ex.relationships.find(
      (r) => r.subjectKey === svc.key && r.property === "provider",
    );
    expect(rel?.predicate).toBe("references"); // unmapped relation property: honest generic
    expect(rel?.objectKey).toBe("https://acme.example.com/#organization");
  });

  test("9. malformed block is unsupported evidence; the good block still parses", async () => {
    const ex = await extractStructuredData(FIXTURE_MALFORMED.html, CTX);
    expect(ex.stats.blocksTotal).toBe(2);
    expect(ex.stats.blocksMalformed).toBe(1);
    expect(ex.unsupported.some((u) => u.kind === "malformed-block")).toBe(true);
    expect(fact(ex.facts, "title")?.value).toBe("Acme Services");
    expect(fact(ex.facts, "phone")?.value).toBe("970-555-0100");
  });

  test("10. Coppersmith real shape: @GRAPH VERIFIED, telephone found, address private", async () => {
    const ex = await extractStructuredData(COPPERSMITH_JSONLD_HTML, {
      sourceUrl: "https://www.coppersmithplumbing.com/",
      observedAt: "2026-09-21T12:01:10.844Z",
    });
    // @GRAPH VERIFIED: all 11 unique nodes visited (Place, Organization,
    // WebSite, 2x ImageObject with @id, WebPage, Person, Article, the
    // merged PostalAddress blank node, and the SearchAction chrome node
    // which is then deliberately skipped and recorded as unsupported).
    // The two identical PostalAddress blanks (org.address and
    // place.address) merge by content hash: correct.
    expect(ex.stats.nodesVisited).toBe(11);
    expect(ex.stats.nodeIds).toContain("https://www.coppersmithplumbing.com/#organization");
    expect(ex.stats.nodeIds).toContain("https://www.coppersmithplumbing.com/#place");
    // The failure that started this build: telephone now found, verbatim.
    const phone = fact(ex.facts, "phone");
    expect(phone?.value).toBe("970-245-3869");
    expect(phone?.factClass).toBe("DIRECT_FACT");
    // Multi-type kept.
    const org = ex.entities.find((e) => e.key === "https://www.coppersmithplumbing.com/#organization");
    expect(org?.types).toEqual(["Organization", "Plumber"]);
    // Street address classified private and counted.
    expect(fact(ex.facts, "street_address")?.visibility).toBe("private");
    expect(ex.stats.privateFactsWithheld).toBeGreaterThanOrEqual(1);
    // Hours, logo, sameAs all visible now.
    expect(fact(ex.facts, "hours")?.value).toBe("Mo,Tu,We,Th,Fr 07:30-16:00");
    expect(fact(ex.facts, "socials")?.value).toBe("https://coppersmithplumbing.com");
    // @id references resolved to relationships.
    const preds = new Set(ex.relationships.map((r) => r.predicate));
    expect(preds.has("located_at")).toBe(true);
    expect(preds.has("has_address")).toBe(true);
    expect(preds.has("published_by")).toBe(true);
    // Unsupported evidence is honest, not silent.
    expect(ex.unsupported.length).toBeGreaterThan(0);
    expect(ex.unsupported.some((u) => u.kind === "site-chrome-node")).toBe(true);
  });
});

function byEntity(facts: ParsedFact[]): Map<string, ParsedFact[]> {
  const m = new Map<string, ParsedFact[]>();
  for (const f of facts) {
    if (f.entityId === undefined) continue;
    const l = m.get(f.entityId) ?? [];
    l.push(f);
    m.set(f.entityId, l);
  }
  return m;
}

describe("offline expansion", () => {
  test("no remote context is ever fetched; refusal is unsupported, not fatal", async () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://example.com/some-remote-context.jsonld",
      "@type": "Organization",
      name: "Acme",
    })}</script>`;
    const ex = await extractStructuredData(html, CTX);
    expect(ex.facts).toHaveLength(0);
    expect(ex.unsupported.some((u) => u.kind === "expansion-failed")).toBe(true);
  });

  test("blank-node identity does not depend on allocation order", async () => {
    // Two documents with the same blank nodes in different order must
    // produce the same entity keys.
    const addr = (city: string) => ({ "@type": "PostalAddress", addressLocality: city });
    const docA = {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", "@id": "https://x.example/#o", name: "O", address: addr("B") },
        { "@type": "Place", "@id": "https://x.example/#p", address: addr("A") },
      ],
    };
    const docB = {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Place", "@id": "https://x.example/#p", address: addr("A") },
        { "@type": "Organization", "@id": "https://x.example/#o", name: "O", address: addr("B") },
      ],
    };
    const htmlOf = (d: unknown) =>
      `<script type="application/ld+json">${JSON.stringify(d)}</script>`;
    const exA = await extractStructuredData(htmlOf(docA), CTX);
    const exB = await extractStructuredData(htmlOf(docB), CTX);
    const keysA = exA.entities.map((e) => e.key);
    const keysB = exB.entities.map((e) => e.key);
    expect(keysA).toEqual(keysB);
  });
});
