/**
 * Proceduralizer stage tests: parse, normalize, extract, resolve, project.
 * Deterministic stages get deterministic assertions, including the address
 * rule: precise street addresses are never auto-published.
 */

import {
  discover,
  extract,
  normalize,
  parse,
  project,
  runExtractionPipeline,
  provenance,
  relate,
  resolve,
  type AcquiredSource,
  type ParsedFact,
} from "../proceduralizer";

const NOW = "2026-09-21T12:00:00.000Z";

function acquired(raw: string, sourceType: AcquiredSource["sourceType"] = "html"): AcquiredSource {
  return {
    url: "https://example.com/",
    sourceType,
    discoveredAt: NOW,
    raw,
    ok: true,
    status: 200,
  };
}

describe("proceduralizer stages", () => {
  test("discover enumerates the conventional sources", () => {
    const sources = discover("https://example.com", NOW);
    expect(sources.map((s) => s.sourceType)).toEqual(["sitemap", "rss", "atom", "html"]);
    expect(sources[0].url).toBe("https://example.com/sitemap.xml");
  });

  test("parse harvests JSON-LD first", async () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type":"LocalBusiness","name":"Acme","telephone":"555-0100"}</script>
      <meta property="og:title" content="OG Title" />
      <title>Plain Title</title>
    </head></html>`;
    const facts = await parse(acquired(html));
    const names = facts.map((f) => f.name + "=" + f.value);
    expect(names).toContain("title=Acme");
    expect(names).toContain("phone=555-0100");
    expect(names).toContain("title=OG Title");
    expect(names).toContain("title=Plain Title");
  });

  test("normalize cleans values", () => {
    const facts: ParsedFact[] = [
      { name: " Title ", value: "  Hello   <b>world</b> ", sourceType: "html", inferred: false },
    ];
    const out = normalize(facts);
    expect(out[0].name).toBe("title");
    expect(out[0].value).toBe("Hello world");
  });

  test("extract drops precise street addresses, keeps coarse locality", () => {
    const facts: ParsedFact[] = [
      { name: "streetaddress", value: "123 Main St, Grand Junction, CO", sourceType: "json-ld", inferred: false },
    ];
    const out = extract(normalize(facts));
    expect(out.find((f) => f.name === "streetaddress")).toBeUndefined();
    const locality = out.find((f) => f.name === "locality");
    expect(locality?.value).toBe("Grand Junction, CO");
    expect(locality?.inferred).toBe(true);
  });

  test("provenance labels every field website_statement", () => {
    const source = { url: "https://example.com/", sourceType: "json-ld" as const, discoveredAt: NOW };
    const fields = provenance(
      source,
      [{ name: "title", value: "Acme", sourceType: "json-ld", inferred: false }],
      NOW,
      () => "ev-1",
    );
    expect(fields[0]).toMatchObject({
      sourceUrl: "https://example.com/",
      sourceType: "json-ld",
      observedAt: NOW,
      evidenceRef: "ev-1",
      confidence: 1.0,
      factClass: "DIRECT_FACT",
      visibility: "public",
      claimKind: "website_statement",
    });
  });

  test("resolve prefers JSON-LD over OpenGraph", () => {
    const mk = (sourceType: AcquiredSource["sourceType"], value: string) => ({
      name: "title",
      value,
      sourceUrl: "https://example.com/",
      sourceType,
      observedAt: NOW,
      evidenceRef: "ev",
      confidence: 1.0,
      factClass: "DIRECT_FACT",
      visibility: "public",
      claimKind: "website_statement" as const,
    });
    const out = resolve([mk("opengraph", "OG Title"), mk("json-ld", "JSON-LD Title")]);
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe("JSON-LD Title");
  });

  test("relate turns social links into relationships", () => {
    const fields = [
      {
        name: "socials",
        value: ["https://facebook.com/acme"],
        sourceUrl: "https://example.com/",
        sourceType: "html" as const,
        observedAt: NOW,
        evidenceRef: "ev",
        confidence: 1.0,
        visibility: "public",
        claimKind: "website_statement" as const,
      },
    ];
    const pairs = relate(fields);
    expect(pairs).toEqual([
      { subjectHint: "business", predicate: "links_to", objectHint: "https://facebook.com/acme" },
    ]);
  });

  test("project emits a business plus a location object, never a duplicated address string", () => {
    const fields = [
      {
        name: "title",
        value: "Acme",
        sourceUrl: "https://example.com/",
        sourceType: "json-ld" as const,
        observedAt: NOW,
        evidenceRef: "ev",
        confidence: 1.0,
        visibility: "public",
        claimKind: "website_statement" as const,
      },
      {
        name: "locality",
        value: "Grand Junction, CO",
        sourceUrl: "https://example.com/",
        sourceType: "json-ld" as const,
        observedAt: NOW,
        evidenceRef: "ev",
        confidence: 0.7,
        visibility: "public",
        claimKind: "website_statement" as const,
      },
    ];
    const { objects, relationships } = project(fields, "https://example.com/", NOW, "acme");
    expect(objects.map((o) => o.schema)).toEqual([
      "ping.social.business@1",
      "ping.social.location@1",
    ]);
    expect(objects[0].provenance.kind).toBe("website-derived");
    expect(relationships).toHaveLength(1);
    expect(relationships[0].predicate).toBe("located_at");
  });

  test("project is deterministic: two identical runs are byte-identical", () => {
    const fields = [
      {
        name: "title",
        value: "Acme",
        sourceUrl: "https://example.com/",
        sourceType: "json-ld" as const,
        observedAt: NOW,
        evidenceRef: "ev",
        confidence: 1.0,
        visibility: "public",
        claimKind: "website_statement" as const,
      },
      {
        name: "locality",
        value: "Grand Junction, CO",
        sourceUrl: "https://example.com/",
        sourceType: "json-ld" as const,
        observedAt: NOW,
        evidenceRef: "ev",
        confidence: 0.7,
        visibility: "public",
        claimKind: "website_statement" as const,
      },
    ];
    // No counter reset between the two runs: identical inputs must yield
    // identical output regardless of module state or call order.
    const a = project(fields, "https://example.com/", NOW, "acme");
    const b = project(fields, "https://example.com/", NOW, "acme");
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});


describe("structured tiers, decoding, and privacy", () => {
  const acquiredHtml = (html: string): AcquiredSource => ({
    url: "https://www.coppersmithplumbing.com/",
    sourceType: "html",
    discoveredAt: "2026-09-21T12:00:00.000Z",
    raw: html,
    ok: true,
    status: 200,
  });

  test("per-fact source tier: JSON-LD outranks OG/meta in the same fetch", async () => {
    const html = `<!doctype html><html><head>
<meta property="og:title" content="OG Title Loses">
<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": "https://x.example/#o",
      name: "JSON-LD Title Wins",
    })}</script>
</head></html>`;
    const facts = await parse(acquiredHtml(html));
    const titles = facts.filter((f) => f.name === "title");
    expect(titles).toHaveLength(2);
    const tiers = Object.fromEntries(titles.map((t) => [t.sourceType, t.value]));
    expect(tiers["json-ld"]).toBe("JSON-LD Title Wins");
    expect(tiers["opengraph"]).toBe("OG Title Loses");
    // And resolution picks the json-ld one deterministically.
    const resolved = resolve(facts, { sourceUrl: "https://x.example/", observedAt: "2026-09-21T12:00:00.000Z" });
    expect(resolved.find((f) => f.name === "title")?.value).toBe("JSON-LD Title Wins");
  });

  test("RUN-NOTES #5: HTML entities are decoded before facts are emitted", async () => {
    const html = `<!doctype html><html><head><title>Copper &amp; Sons</title></head></html>`;
    const facts = normalize(await parse(acquiredHtml(html)));
    const title = facts.find((f) => f.name === "title");
    expect(title?.value).toBe("Copper & Sons");
  });

  test("Grill 19: private facts fail closed in resolve() and project()", async () => {
    const privateFact: ParsedFact = {
      name: "street_address",
      value: "123 Main St",
      sourceType: "json-ld",
      sourceRef: "structured:https://x.example/#o.streetAddress",
      factClass: "DIRECT_FACT",
      visibility: "private",
      confidence: 0.99,
      inferred: false,
    };
    const publicFact: ParsedFact = {
      name: "phone",
      value: "970-555-0100",
      sourceType: "json-ld",
      sourceRef: "structured:https://x.example/#o.telephone",
      factClass: "DIRECT_FACT",
      visibility: "public",
      confidence: 0.99,
      inferred: false,
    };
    const ctx = { sourceUrl: "https://x.example/", observedAt: "2026-09-21T12:00:00.000Z" };
    expect(resolve([privateFact], ctx)).toHaveLength(0);
    const g = project(
      resolve([privateFact, publicFact], ctx),
      "https://x.example/",
      "2026-09-21T12:00:00.000Z",
      "ctrl-test",
    );
    const fields = g.objects[0].fields as Record<string, unknown>;
    expect("street_address" in fields).toBe(false);
    expect(fields["phone"]).toBe("970-555-0100");
    expect(JSON.stringify(g)).not.toContain("123 Main St");
  });

  test("every fact carries factClass and visibility end to end", async () => {
    const html = `<!doctype html><html><head>
<meta property="og:title" content="OG">
<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Organization",
      "@id": "https://x.example/#o",
      name: "LD",
      telephone: "970-555-0100",
    })}</script>
</head></html>`;
    const { graph } = await runExtractionPipeline([acquiredHtml(html)], {
      sourceUrl: "https://x.example/",
      observedAt: "2026-09-21T12:00:00.000Z",
      controllerId: "ctrl-test",
    });
    const classes = graph.fieldClasses!;
    const business = graph.objects.find((o) => o.schema === "ping.social.business@1")!;
    for (const [field, cls] of Object.entries(classes[business.id])) {
      expect(["DIRECT_FACT", "DERIVED_FACT", "INFERENCE", "GENERATED_COPY", "USER_OVERRIDE"]).toContain(cls);
      expect(business.fields[field]).toBeDefined();
    }
  });
});
