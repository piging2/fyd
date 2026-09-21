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

  test("parse harvests JSON-LD first", () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type":"LocalBusiness","name":"Acme","telephone":"555-0100"}</script>
      <meta property="og:title" content="OG Title" />
      <title>Plain Title</title>
    </head></html>`;
    const facts = parse(acquired(html));
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
      public: true,
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
      public: true,
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
        public: true,
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
        public: true,
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
        public: true,
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
        public: true,
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
        public: true,
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
