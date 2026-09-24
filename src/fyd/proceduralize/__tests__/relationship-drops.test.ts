/**
 * G3: every relationship candidate terminates in a terminal outcome.
 *
 * Vocabulary: ACCEPTED / REJECTED_SCHEMA / UNRESOLVED_SOURCE /
 * UNRESOLVED_TARGET / AMBIGUOUS_TARGET / DUPLICATE / POLICY_SUPPRESSED /
 * UNSUPPORTED. No candidate may die silently.
 */

import { runExtractionPipeline, type RelationshipOutcome } from "../proceduralizer";

const TS = "2026-09-24T12:00:00.000Z";
const TERMINAL: RelationshipOutcome[] = [
  "ACCEPTED",
  "REJECTED_SCHEMA",
  "UNRESOLVED_SOURCE",
  "UNRESOLVED_TARGET",
  "AMBIGUOUS_TARGET",
  "DUPLICATE",
  "POLICY_SUPPRESSED",
  "UNSUPPORTED",
];

function page(url: string, html: string) {
  return { url, sourceType: "html" as const, discoveredAt: TS, raw: html, ok: true, status: 200 };
}

// JSON-LD: business with worksFor -> named person (should ACCEPT),
// employee -> unknown node id (UNRESOLVED_TARGET), and a site-chrome
// WebSite node referenced as publisher (POLICY_SUPPRESSED).
const HTML = `<!DOCTYPE html><html><head>
<title>TestCo</title>
<meta property="og:title" content="TestCo" />
<meta property="og:description" content="We do things." />
<meta property="og:url" content="https://testco.example/" />
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "LocalBusiness", "@id": "https://testco.example/#biz",
      "name": "TestCo", "worksFor": { "@id": "https://testco.example/#jane" } },
    { "@type": "Person", "@id": "https://testco.example/#jane", "name": "Jane Doe" },
    { "@type": "LocalBusiness", "@id": "https://testco.example/#biz2",
      "name": "TestCo 2", "employee": { "@id": "https://testco.example/#ghost" } },
    { "@type": "WebSite", "@id": "https://testco.example/#site", "name": "TestCo site",
      "publisher": { "@id": "https://testco.example/#biz" } }
  ]
}
</script>
</head><body><h1>TestCo</h1></body></html>`;

async function run(html: string, controllerId = "runner-test") {
  return runExtractionPipeline([page("https://testco.example/", html)], {
    sourceUrl: "https://testco.example/",
    observedAt: TS,
    controllerId,
  } as never);
}

test("every drop carries a terminal outcome from the vocabulary", async () => {
  const out = await run(HTML);
  const drops = out.report.relationshipDrops;
  expect(drops.length).toBeGreaterThan(0);
  for (const d of drops) {
    expect(TERMINAL).toContain(d.outcome);
    expect(d.reason.length).toBeGreaterThan(0);
    expect(d.evidenceRef.length).toBeGreaterThan(0);
    expect(d.subject.length).toBeGreaterThan(0);
    expect(d.predicate.length).toBeGreaterThan(0);
    expect(d.object.length).toBeGreaterThan(0);
  }
  // droppedRelationships count agrees with the ledger length.
  expect(out.graph.droppedRelationships).toBe(drops.length);
});

test("UNRESOLVED_TARGET fires for an @id ref to a node never visited", async () => {
  const out = await run(HTML);
  const hits = out.report.relationshipDrops.filter((d) => d.outcome === "UNRESOLVED_TARGET");
  expect(hits.length).toBeGreaterThan(0);
  expect(hits.some((d) => d.reason.includes("never visited"))).toBe(true);
});

test("named-person works_for is ACCEPTED (no drop), employment lands in the graph", async () => {
  const out = await run(HTML);
  const rels = out.graph.relationships.filter((r) => r.predicate === "works_for");
  expect(rels.length).toBe(1);
  const person = out.graph.objects.find((o) => o.schema === "ping.social.person@1");
  expect(person).toBeDefined();
  // The bytes said business worksFor person (schema.org-backwards); the
  // pipeline records the observed direction, and the generator matches
  // employs/works_for direction-agnostically (1.1.0).
  expect(rels[0].object).toBe(person!.id);
  // No works_for drop for the accepted candidate.
  expect(out.report.relationshipDrops.filter((d) => d.predicate === "works_for")).toHaveLength(0);
});

test("duplicate identical triples terminate as DUPLICATE, first wins", async () => {
  // Same page twice: identical candidates emitted twice.
  const out = await runExtractionPipeline(
    [page("https://testco.example/", HTML), page("https://testco.example/", HTML)],
    { sourceUrl: "https://testco.example/", observedAt: TS, controllerId: "runner-test" } as never,
  );
  const dups = out.report.relationshipDrops.filter((d) => d.outcome === "DUPLICATE");
  expect(dups.length).toBeGreaterThan(0);
  // The graph still holds exactly one copy of each triple.
  const keys = out.graph.relationships.map((r) => r.subject + "|" + r.predicate + "|" + r.object);
  expect(new Set(keys).size).toBe(keys.length);
});

test("drop ledger is deterministic across runs and runners", async () => {
  const a = await run(HTML, "runner-one");
  const b = await run(HTML, "runner-two");
  expect(a.report.relationshipDrops).toEqual(b.report.relationshipDrops);
});
