/**
 * REGRESSION CORPUS: Happy Place AND Coppersmith raw material through the
 * SAME pipeline (runExtractionPipeline). Per-source report: structured
 * facts discovered, objects generated, relationships generated,
 * unsupported evidence. Green only when BOTH pass generically — no
 * site-specific hacks; the JSON-LD @graph path is what makes Coppersmith
 * work, and the flat LocalBusiness path is what makes Happy Place work.
 *
 * Raw material (real bytes, stored in-repo):
 * - src/fyd/proceduralize/raw/coppersmith-plumbing/{index.html,rss.xml}
 *   (fetched 2026-09-21; Rank Math @graph)
 * - src/fyd/proceduralize/raw/happy-place-platform/index.html
 *   (fetched 2026-09-21; flat LocalBusiness JSON-LD)
 */

import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  runExtractionPipeline,
  type AcquiredSource,
  type PipelineReport,
} from "../proceduralizer";

const RAW = path.join(process.cwd(), "src", "fyd", "proceduralize", "raw");

function acquired(
  rel: string,
  url: string,
  sourceType: AcquiredSource["sourceType"],
  observedAt: string,
): AcquiredSource {
  return {
    url,
    sourceType,
    discoveredAt: observedAt,
    raw: readFileSync(path.join(RAW, rel), "utf8"),
    ok: true,
    status: 200,
  };
}

function businessOf(graph: { objects: Array<{ schema: string; [k: string]: unknown }> }) {
  return graph.objects.find((o) => o.schema === "ping.social.business@1")!;
}

function summarize(report: PipelineReport): string {
  const lines = [
    `source: ${report.sourceUrl}`,
    `  facts discovered: ${report.factsDiscovered} ` +
      `(by class: ${Object.entries(report.factsByClass).map(([k, v]) => `${k}=${v}`).join(", ")})`,
    `  facts by tier: ${Object.entries(report.factsBySource).map(([k, v]) => `${k}=${v}`).join(", ")}`,
    `  @graph nodes visited: ${report.graphNodesVisited}`,
    `  objects generated: ${report.objectsGenerated}`,
    `  relationships generated: ${report.relationshipsGenerated}`,
    `  private facts withheld: ${report.privateWithheld}`,
    `  unsupported evidence: ${report.unsupported.length} ` +
      `(${[...new Set(report.unsupported.map((u) => u.kind))].join(", ")})`,
  ];
  return lines.join("\n");
}

describe("regression corpus", () => {
  const COPPER_AT = "2026-09-21T12:01:10.844Z";
  const HP_AT = "2026-09-21T13:00:00.000Z";

  test("Coppersmith: @graph through the same pipeline", async () => {
    const sources = [
      acquired("coppersmith-plumbing/index.html", "https://www.coppersmithplumbing.com/", "html", COPPER_AT),
      acquired("coppersmith-plumbing/rss.xml", "https://www.coppersmithplumbing.com/feed/", "rss", COPPER_AT),
    ];
    const { graph, report } = await runExtractionPipeline(sources, {
      sourceUrl: "https://www.coppersmithplumbing.com/",
      observedAt: COPPER_AT,
      controllerId: "identity_fyd_corpus",
    });
    console.log(summarize(report));

    // Structured facts discovered (was ZERO through the old flattener).
    expect(report.factsDiscovered).toBeGreaterThan(20);
    expect(report.factsByClass.DIRECT_FACT).toBeGreaterThan(10);
    expect(report.factsBySource["json-ld"]).toBeGreaterThan(10);
    // @GRAPH VERIFIED (11 unique nodes visited, including the SearchAction
    // chrome node which was then deliberately skipped; the two identical
    // PostalAddress blanks merge by content hash).
    expect(report.graphNodesVisited).toBe(11);

    const business = businessOf(graph);
    const fields = business.fields as Record<string, string | string[]>;
    const classes = graph.fieldClasses![business.id];
    // RUN-NOTES #3 proven on real data: the org's JSON-LD name outranks
    // og:title ("Coppersmith Plumbing & HVAC") and the RSS channel title
    // ("Coppersmith Plumbing").
    expect(fields["title"]).toBe("Coppersmith Plumbing - HVAC - Mechanical");
    expect(classes["title"]).toBe("DIRECT_FACT");
    // Field rule: JSON-LD telephone used verbatim, no LLM.
    expect(fields["phone"]).toBe("970-245-3869");
    expect(classes["phone"]).toBe("DIRECT_FACT");
    expect(fields["hours"]).toBe("Mo,Tu,We,Th,Fr 07:30-16:00");
    // Structured PostalAddress -> coarse public locality (DERIVED_FACT).
    expect(fields["locality"]).toBe("Grand Junction, Colorado, 81501, United States");
    expect(classes["locality"]).toBe("DERIVED_FACT");

    // Grill 19 on real data: the street address never reaches the graph.
    expect(JSON.stringify(graph)).not.toContain("630 Maldonado");
    expect(report.privateWithheld).toBeGreaterThanOrEqual(1);

    // Objects: business + location + person + external identity.
    const schemas = graph.objects.map((o) => o.schema);
    expect(schemas).toContain("ping.social.business@1");
    expect(schemas).toContain("ping.social.location@1");
    expect(schemas).toContain("ping.social.person@1");
    expect(schemas).toContain("ping.social.external_identity@1");
    const person = graph.objects.find((o) => o.schema === "ping.social.person@1")!;
    expect(person.title).toBe("coppersmithplm");

    // Relationships: located_at, works_for, links_to at minimum.
    const preds = new Set(graph.relationships.map((r) => r.predicate));
    expect(preds.has("located_at")).toBe(true);
    expect(preds.has("works_for")).toBe(true);
    expect(preds.has("links_to")).toBe(true);
    expect(report.relationshipsGenerated).toBeGreaterThanOrEqual(3);

    // Unsupported evidence is honest, not silent.
    expect(report.unsupported.length).toBeGreaterThan(0);

    // Determinism: same sources -> same graph, byte-identical.
    const again = await runExtractionPipeline(sources, {
      sourceUrl: "https://www.coppersmithplumbing.com/",
      observedAt: COPPER_AT,
      controllerId: "identity_fyd_corpus",
    });
    expect(JSON.stringify(again.graph)).toBe(JSON.stringify(graph));
    expect(JSON.stringify(again.report)).toBe(JSON.stringify(report));
  });

  test("Happy Place: flat LocalBusiness through the same pipeline", async () => {
    const sources = [
      acquired("happy-place-platform/index.html", "https://happy-place-platform.vercel.app/", "html", HP_AT),
    ];
    const { graph, report } = await runExtractionPipeline(sources, {
      sourceUrl: "https://happy-place-platform.vercel.app/",
      observedAt: HP_AT,
      controllerId: "identity_fyd_corpus",
    });
    console.log(summarize(report));

    expect(report.factsDiscovered).toBeGreaterThan(5);
    expect(report.factsBySource["json-ld"]).toBeGreaterThan(5);
    expect(report.graphNodesVisited).toBe(2); // LocalBusiness + PostalAddress

    const business = businessOf(graph);
    const fields = business.fields as Record<string, string | string[]>;
    const classes = graph.fieldClasses![business.id];
    // JSON-LD name outranks the <title> tag.
    expect(fields["title"]).toBe("Happy Place Carpentry LLC");
    expect(classes["title"]).toBe("DIRECT_FACT");
    // Field rules: telephone + email used verbatim.
    expect(fields["phone"]).toBe("+15412865190");
    expect(fields["email"]).toBe("taylor@happyplacecarpentry.com");
    // Structured address -> coarse locality, no street address involved.
    expect(fields["locality"]).toBe("Adair Village, OR, US");
    expect(classes["locality"]).toBe("DERIVED_FACT");
    expect(fields["price_range"]).toBe("$$");

    // RUN-NOTES #5: no raw entities leak into fields.
    for (const o of graph.objects) {
      for (const v of Object.values(o.fields)) {
        const vals = Array.isArray(v) ? v : [v];
        for (const s of vals) expect(s).not.toContain("&amp;");
      }
    }

    const schemas = graph.objects.map((o) => o.schema);
    expect(schemas).toContain("ping.social.business@1");
    expect(schemas).toContain("ping.social.location@1");
    expect(report.relationshipsGenerated).toBeGreaterThanOrEqual(1);

    const again = await runExtractionPipeline(sources, {
      sourceUrl: "https://happy-place-platform.vercel.app/",
      observedAt: HP_AT,
      controllerId: "identity_fyd_corpus",
    });
    expect(JSON.stringify(again.graph)).toBe(JSON.stringify(graph));
  });
});
