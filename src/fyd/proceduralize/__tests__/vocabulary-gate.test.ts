/**
 * Vocabulary gate tests (Nolan 2026-09-28, fail closed).
 *
 * RAW OBSERVATION -> vocabulary validation ->
 *   KNOWN VALID   -> normalize -> canonical semantic candidate
 *   UNKNOWN/UNSUPPORTED -> preserve evidence -> mark unsupported/quarantined
 *                          -> do NOT canonicalize -> reconciliation/work queue
 *
 * Adversarial matrix:
 *  1. Foreign-namespace JSON-LD type ("https://evil.example/Plumber"):
 *     quarantined, zero canonical semantics, evidence survives.
 *  2. Foreign-namespace type whose SUFFIX matches a known type: the
 *     collision that must never happen (never becomes schema.org Plumber).
 *  3. Mixed vocabulary on one entity: canonical on known types only,
 *     unknown IRIs preserved as evidence.
 *  4. Foreign-namespace microdata itemtype: never emitted as a record;
 *     rejection evidence preserved end to end.
 *  5. schema.org microdata itemtype: still emitted (no regression).
 *  6. Reference from a canonical entity to a quarantined node:
 *     typed VOCABULARY_QUARANTINED drop, never a relationship.
 *  7. selectPrimaryBusiness never selects a quarantined entity.
 *  8. Reconciliation queue: deterministic, derived from evidence, no store.
 *  9. vocabulary.ts unit classification: namespace edges.
 */

import {
  classifyTerm,
  classifyEntityTypes,
} from "../vocabulary";
import {
  extractMicrodataWithRejections,
  extractMicrodata,
} from "../microdata";
import {
  extractStructuredData,
  selectPrimaryBusiness,
  type ScorableFact,
} from "../structured-data";

const CTX = {
  sourceUrl: "https://acme.example.com/",
  observedAt: "2026-09-28T12:00:00.000Z",
};

const KNOWN_BLOCK = `{
  "@context": "https://schema.org",
  "@type": "Plumber",
  "@id": "https://acme.example.com/#biz",
  "name": "Acme Plumbing",
  "telephone": "970-555-0100",
  "url": "https://acme.example.com/"
}`;

// Foreign namespace, suffix collides with a known schema.org type.
// This is the poisoning case: it must NEVER become a schema.org Plumber.
const EVIL_BLOCK = `{
  "@context": "https://schema.org",
  "@type": "https://evil.example/vocab/Plumber",
  "@id": "https://evil.example/#b",
  "name": "Evil Plumbing",
  "telephone": "970-555-0199"
}`;

const MIXED_BLOCK = `{
  "@context": "https://schema.org",
  "@type": ["https://schema.org/Plumber", "https://evil.example/vocab/VIP"],
  "@id": "https://acme.example.com/#mixed",
  "name": "Acme Mixed"
}`;

function htmlWith(...blocks: string[]): string {
  return blocks
    .map((b) => `<script type="application/ld+json">${b}</script>`)
    .join("\n");
}

describe("vocabulary.ts classification", () => {
  test("schema.org http/https IRIs classify as schema.org", () => {
    expect(classifyTerm("https://schema.org/Plumber").namespace).toBe("schema.org");
    expect(classifyTerm("http://schema.org/Plumber").namespace).toBe("schema.org");
    expect(classifyTerm("https://schema.org/Plumber").name).toBe("Plumber");
  });

  test("foreign namespaces classify as unknown, never compacted", () => {
    const c = classifyTerm("https://evil.example/vocab/Plumber");
    expect(c.namespace).toBe("unknown");
    // The raw IRI survives as the name: no invented compact name, so it
    // can never collide with schema.org "Plumber" in a mapping table.
    expect(c.name).toBe("https://evil.example/vocab/Plumber");
    expect(c.iri).toBe("https://evil.example/vocab/Plumber");
  });

  test("lookalike namespaces classify as unknown", () => {
    expect(classifyTerm("https://schema.org.evil.example/Plumber").namespace).toBe("unknown");
    expect(classifyTerm("https://schema-org/Plumber").namespace).toBe("unknown");
    // The bare namespace IRI is inside the namespace but names no term:
    // classifyTerm reports the namespace, classifyEntityTypes treats the
    // empty name as unknown.
    const bare = classifyTerm("https://schema.org/");
    expect(bare.namespace).toBe("schema.org");
    expect(bare.name).toBe("");
    expect(classifyEntityTypes(["https://schema.org/"]).verdict).toBe("UNKNOWN");
  });

  test("empty/missing input classifies as unknown", () => {
    expect(classifyTerm("").namespace).toBe("unknown");
    expect(classifyTerm(undefined).namespace).toBe("unknown");
    expect(classifyTerm(null).namespace).toBe("unknown");
  });

  test("classifyEntityTypes: foreign-only is UNKNOWN", () => {
    const v = classifyEntityTypes(["https://evil.example/vocab/Plumber"]);
    expect(v.verdict).toBe("UNKNOWN");
    expect(v.knownTypes).toEqual([]);
    expect(v.unknownTypeIris).toEqual(["https://evil.example/vocab/Plumber"]);
  });

  test("classifyEntityTypes: mixed is KNOWN on schema.org types only", () => {
    const v = classifyEntityTypes([
      "https://evil.example/vocab/VIP",
      "https://schema.org/Plumber",
    ]);
    expect(v.verdict).toBe("KNOWN");
    expect(v.knownTypes).toEqual(["Plumber"]);
    expect(v.unknownTypeIris).toEqual(["https://evil.example/vocab/VIP"]);
  });

  test("classifyEntityTypes: bare names are unknown (no namespace claim)", () => {
    const v = classifyEntityTypes(["Plumber"]);
    expect(v.verdict).toBe("UNKNOWN");
  });
});

describe("microdata vocabulary gate", () => {
  const EVIL_SCOPE = `<div itemscope itemtype="https://evil.example/vocab/Plumber">
    <span itemprop="name">Evil Plumbing</span>
  </div>`;
  const GOOD_SCOPE = `<div itemscope itemtype="https://schema.org/Plumber">
    <span itemprop="name">Acme Plumbing</span>
  </div>`;

  test("foreign-namespace itemtype is rejected, evidence preserved", () => {
    const { items, rejections } = extractMicrodataWithRejections(EVIL_SCOPE);
    expect(items).toHaveLength(0);
    expect(rejections).toHaveLength(1);
    expect(rejections[0].itemtype).toBe("https://evil.example/vocab/Plumber");
    expect(rejections[0].raw).toBeTruthy();
    expect(rejections[0].reason).toMatch(/quarantined/);
  });

  test("schema.org itemtype still emits (no regression)", () => {
    const { items, rejections } = extractMicrodataWithRejections(GOOD_SCOPE);
    expect(rejections).toHaveLength(0);
    expect(items).toHaveLength(1);
    expect(items[0].parsed["@type"]).toBe("Plumber");
  });

  test("extractMicrodata keeps its contract (items only)", () => {
    expect(extractMicrodata(EVIL_SCOPE)).toHaveLength(0);
    expect(extractMicrodata(GOOD_SCOPE)).toHaveLength(1);
  });

  test("end to end: evil microdata scope is never canonicalized, evidence survives", async () => {
    const html = EVIL_SCOPE + GOOD_SCOPE;
    const ex = await extractStructuredData(html, CTX);
    // Zero canonical semantics from the evil scope.
    expect(ex.entities.some((e) => e.types.includes("Plumber") && e.key.includes("evil"))).toBe(false);
    expect(ex.facts.some((f) => String(f.value).includes("Evil Plumbing"))).toBe(false);
    // Evidence survives: unsupported + reconciliation.
    const unmapped = ex.unsupported.filter((u) => u.kind === "unmapped-node-type");
    expect(unmapped.length).toBeGreaterThanOrEqual(1);
    expect(unmapped.some((u) => (u.detail ?? "").includes("https://evil.example/vocab/Plumber"))).toBe(true);
    const q = ex.reconciliation.filter((r) => r.source === "microdata");
    expect(q.length).toBeGreaterThanOrEqual(1);
    expect(q[0].unknownTypeIris).toContain("https://evil.example/vocab/Plumber");
    // The good scope is unaffected.
    expect(ex.facts.some((f) => String(f.value).includes("Acme Plumbing"))).toBe(true);
  });
});

describe("JSON-LD vocabulary quarantine", () => {
  test("foreign-namespace entity: zero canonical semantics, evidence survives", async () => {
    const ex = await extractStructuredData(htmlWith(KNOWN_BLOCK, EVIL_BLOCK), CTX);

    // 1. No entity for the evil node.
    expect(ex.entities.some((e) => e.key === "https://evil.example/#b")).toBe(false);
    expect(ex.entities).toHaveLength(1);
    expect(ex.entities[0].types).toEqual(["Plumber"]);

    // 2. No facts or relationships from the evil node.
    expect(ex.facts.some((f) => String(f.value).includes("Evil Plumbing"))).toBe(false);
    expect(ex.facts.some((f) => String(f.value).includes("970-555-0199"))).toBe(false);
    expect(ex.relationships.some((r) => r.subjectKey === "https://evil.example/#b")).toBe(false);

    // 3. Evidence preserved: unsupported + reconciliation carry the raw IRI.
    const uv = ex.unsupported.filter((u) => u.kind === "unknown-vocabulary");
    expect(uv.length).toBeGreaterThanOrEqual(1);
    expect(uv.some((u) => (u.detail ?? "").includes("https://evil.example/vocab/Plumber"))).toBe(true);
    const rec = ex.reconciliation.find((r) => r.entityKey === "https://evil.example/#b");
    expect(rec).toBeDefined();
    expect(rec!.unknownTypeIris).toEqual(["https://evil.example/vocab/Plumber"]);
    expect(rec!.queueKey).toBe("entity:https://evil.example/#b");

    // 4. The known block is fully canonical.
    expect(ex.facts.some((f) => String(f.value).includes("Acme Plumbing"))).toBe(true);
  });

  test("mixed vocabulary: canonical on known types only", async () => {
    const ex = await extractStructuredData(htmlWith(MIXED_BLOCK), CTX);
    const mixed = ex.entities.find((e) => e.key === "https://acme.example.com/#mixed");
    expect(mixed).toBeDefined();
    expect(mixed!.types).toEqual(["Plumber"]);
    // The unknown IRI is evidence, not meaning.
    const uv = ex.unsupported.filter(
      (u) => u.kind === "unknown-vocabulary" && u.entityKey === mixed!.key,
    );
    expect(uv).toHaveLength(1);
    expect(uv[0].detail).toContain("https://evil.example/vocab/VIP");
    const rec = ex.reconciliation.find((r) => r.entityKey === mixed!.key);
    expect(rec).toBeDefined();
    expect(rec!.knownTypes).toEqual(["Plumber"]);
    expect(rec!.unknownTypeIris).toEqual(["https://evil.example/vocab/VIP"]);
  });

  test("reference to a quarantined node drops VOCABULARY_QUARANTINED, never a relationship", async () => {
    const referrer = `{
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": "https://acme.example.com/#org",
      "name": "Acme Org",
      "provider": { "@id": "https://evil.example/#b" }
    }`;
    const ex = await extractStructuredData(htmlWith(referrer, EVIL_BLOCK), CTX);
    expect(
      ex.relationships.some((r) => r.objectKey === "https://evil.example/#b"),
    ).toBe(false);
    const drop = ex.refDrops.find(
      (d) => d.refNodeId === "https://evil.example/#b",
    );
    expect(drop).toBeDefined();
    expect(drop!.outcome).toBe("VOCABULARY_QUARANTINED");
  });

  test("selectPrimaryBusiness never selects a quarantined entity", async () => {
    const evilWithSite = `{
      "@context": "https://schema.org",
      "@type": "https://evil.example/vocab/Plumber",
      "@id": "https://evil.example/#b",
      "name": "Evil Plumbing",
      "url": "https://acme.example.com/"
    }`;
    const plainOrg = `{
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": "https://acme.example.com/#org",
      "name": "Acme Org"
    }`;
    const ex = await extractStructuredData(htmlWith(evilWithSite, plainOrg), CTX);
    const factsByEntity = new Map<string, ScorableFact[]>();
    for (const f of ex.facts) {
      const eid = (f as { entityId?: string }).entityId ?? "";
      const arr = factsByEntity.get(eid) ?? [];
      arr.push({ name: f.name, value: f.value });
      factsByEntity.set(eid, arr);
    }
    const primary = selectPrimaryBusiness(ex.entities, factsByEntity, CTX.sourceUrl);
    expect(primary).toBe("https://acme.example.com/#org");
  });

  test("reconciliation queue is deterministic and derived, not stored", async () => {
    const html = htmlWith(KNOWN_BLOCK, EVIL_BLOCK, MIXED_BLOCK);
    const a = await extractStructuredData(html, CTX);
    const b = await extractStructuredData(html, CTX);
    expect(JSON.stringify(a.reconciliation)).toBe(JSON.stringify(b.reconciliation));
    const keys = a.reconciliation.map((r) => r.queueKey);
    expect([...keys].sort()).toEqual(keys);
    // Every entry names unknown IRIs as evidence.
    for (const r of a.reconciliation) {
      expect(r.unknownTypeIris.length).toBeGreaterThanOrEqual(1);
      expect(r.reason).toBeTruthy();
    }
    expect(a.reconciliation).toHaveLength(2);
  });
});
