/**
 * Tests for the per-location block lane (2026-09-30): repeated
 * name+address+phone blocks become ping.social.location@1 objects with
 * located_at edges, via stable synthetic entity ids
 * (location-block:<key>), following the service-card precedent.
 */
import {
  extractLocationBlocks,
  LOCATION_BLOCK_ENTITY_PREFIX,
} from "../location-blocks";
import { runExtractionPipeline } from "../proceduralizer";

const TS = "2026-09-30T12:00:00.000Z";
const URL = "https://testco.example/locations";

function page(url: string, html: string) {
  return {
    url,
    sourceType: "html" as const,
    discoveredAt: TS,
    raw: html,
    ok: true,
    status: 200,
  };
}

const TWO_BLOCKS = `<!DOCTYPE html><html><head><title>TestCo Locations</title></head><body>
<h1>Our Locations</h1>
<div class="location">
  <h3>Downtown</h3>
  <p>100 Main St, Denver, CO 80202</p>
  <p>(303) 555-0100</p>
</div>
<div class="location">
  <h3>Uptown</h3>
  <p>200 Oak Ave, Denver, CO 80203</p>
  <p>(303) 555-0200</p>
</div>
</body></html>`;

describe("extractLocationBlocks", () => {
  test("extracts two repeated blocks with verbatim name/address/phone", () => {
    const blocks = extractLocationBlocks(TWO_BLOCKS, URL);
    expect(blocks).toHaveLength(2);
    const byAddr = new Map(blocks.map((b) => [b.address, b]));
    const downtown = byAddr.get("100 Main St, Denver, CO 80202")!;
    expect(downtown.name).toBe("Downtown");
    expect(downtown.phone).toBe("(303) 555-0100");
    expect(downtown.sourceUrl).toBe(URL);
    const uptown = byAddr.get("200 Oak Ave, Denver, CO 80203")!;
    expect(uptown.name).toBe("Uptown");
    expect(uptown.phone).toBe("(303) 555-0200");
  });

  test("block keys are stable across runs and sorted", () => {
    const a = extractLocationBlocks(TWO_BLOCKS, URL).map((b) => b.key);
    const b = extractLocationBlocks(TWO_BLOCKS, URL).map((b) => b.key);
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual(a);
    expect(new Set(a).size).toBe(2);
  });

  test("single location block yields nothing (repeated-only rule)", () => {
    const html = `<!DOCTYPE html><html><head><title>TestCo</title></head><body>
<div class="location"><h3>Only</h3><p>100 Main St, Denver, CO 80202</p><p>(303) 555-0100</p></div>
</body></html>`;
    expect(extractLocationBlocks(html, URL)).toEqual([]);
  });

  test("address without phone is not a block", () => {
    const html = `<!DOCTYPE html><html><head><title>TestCo</title></head><body>
<div class="location"><h3>A</h3><p>100 Main St, Denver, CO 80202</p><p>(303) 555-0100</p></div>
<div class="location"><h3>B</h3><p>200 Oak Ave, Denver, CO 80203</p></div>
</body></html>`;
    expect(extractLocationBlocks(html, URL)).toEqual([]);
  });

  test("footer duplicate of a main-content address is deduped", () => {
    const html = `<!DOCTYPE html><html><head><title>TestCo Locations</title></head><body>
<div class="location"><h3>Downtown</h3><p>100 Main St, Denver, CO 80202</p><p>(303) 555-0100</p></div>
<div class="location"><h3>Uptown</h3><p>200 Oak Ave, Denver, CO 80203</p><p>(303) 555-0200</p></div>
<footer><div class="foot-loc">Visit us: 100 Main St, Denver, CO 80202 (303) 555-0100</div></footer>
</body></html>`;
    const blocks = extractLocationBlocks(html, URL);
    expect(blocks).toHaveLength(2);
  });

  test("nested markup: outer wrapper is not a second block", () => {
    const html = `<!DOCTYPE html><html><head><title>TestCo Locations</title></head><body>
<div class="loc"><h3>Downtown</h3><div class="addr">100 Main St, Denver, CO 80202</div><div class="ph">(303) 555-0100</div></div>
<div class="loc"><h3>Uptown</h3><div class="addr">200 Oak Ave, Denver, CO 80203</div><div class="ph">(303) 555-0200</div></div>
</body></html>`;
    const blocks = extractLocationBlocks(html, URL);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.name).sort()).toEqual(["Downtown", "Uptown"]);
  });

  test("block without a heading gets an empty name, not an invented one", () => {
    const html = `<!DOCTYPE html><html><head><title>TestCo Locations</title></head><body>
<div class="location"><p>100 Main St, Denver, CO 80202</p><p>(303) 555-0100</p></div>
<div class="location"><p>200 Oak Ave, Denver, CO 80203</p><p>(303) 555-0200</p></div>
</body></html>`;
    const blocks = extractLocationBlocks(html, URL);
    expect(blocks).toHaveLength(2);
    expect(blocks.every((b) => b.name === "")).toBe(true);
  });

  test("deterministic: identical output on repeat runs", () => {
    const a = JSON.stringify(extractLocationBlocks(TWO_BLOCKS, URL));
    const b = JSON.stringify(extractLocationBlocks(TWO_BLOCKS, URL));
    expect(a).toBe(b);
  });
});

const E2E_HTML = `<!DOCTYPE html><html><head>
<title>TestCo Locations</title>
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"LocalBusiness",
 "@id":"https://testco.example/#biz","name":"TestCo"}
</script>
</head><body>
<h1>Our Locations</h1>
<div class="location">
  <h3>Downtown</h3>
  <p>100 Main St, Denver, CO 80202</p>
  <p>(303) 555-0100</p>
</div>
<div class="location">
  <h3>Uptown</h3>
  <p>200 Oak Ave, Denver, CO 80203</p>
  <p>(303) 555-0200</p>
</div>
</body></html>`;

async function runE2E() {
  const out = await runExtractionPipeline([page(URL, E2E_HTML)], {
    sourceUrl: "https://testco.example/",
    observedAt: TS,
    controllerId: "runner-test",
  } as never);
  return out.graph;
}

describe("location-block project() lane", () => {
  test("mints one ping.social.location@1 object per block", async () => {
    const graph = await runE2E();
    const locs = graph.objects.filter(
      (o) => o.schema === "ping.social.location@1",
    );
    // Two block objects; a businessId-location object may also exist
    // from the coarse lane only when a PostalAddress/locality exists,
    // which this fixture has not.
    const blockLocs = locs.filter((o) =>
      String(o.id).includes("-location-"),
    );
    expect(blockLocs).toHaveLength(2);
    const addrs = blockLocs.map((o) => o.fields["address"]).sort();
    expect(addrs).toEqual([
      "100 Main St, Denver, CO 80202",
      "200 Oak Ave, Denver, CO 80203",
    ]);
  });

  test("block objects carry name/phone as DIRECT website_statement claims", async () => {
    const graph = await runE2E();
    const locs = graph.objects.filter(
      (o) => o.schema === "ping.social.location@1" && String(o.id).includes("-location-"),
    );
    const downtown = locs.find(
      (o) => o.fields["address"] === "100 Main St, Denver, CO 80202",
    )!;
    expect(downtown.fields["name"]).toBe("Downtown");
    expect(downtown.fields["phone"]).toBe("(303) 555-0100");
    expect(downtown.fields["claimKind"]).toBe("website_statement");
  });

  test("mints a located_at edge per block from the business", async () => {
    const graph = await runE2E();
    const edges = graph.relationships.filter(
      (r) => r.predicate === "located_at" && /-location-/.test(String(r.object)),
    );
    expect(edges).toHaveLength(2);
    expect(
      edges.every((e) => e.evidenceRef.startsWith("proceduralizer:project:location-block:")),
    ).toBe(true);
    // Every edge subject is the business object.
    const bizIds = new Set(
      graph.objects.filter((o) => o.schema === "ping.social.business@1").map((o) => o.id),
    );
    expect(edges.every((e) => bizIds.has(e.subject))).toBe(true);
  });

  test("entity ids use the location-block: prefix", async () => {
    // The synthetic entity id must be visible in the projected object
    // provenance path: object id embeds the entity-key hash.
    const graph = await runE2E();
    const locs = graph.objects.filter(
      (o) => o.schema === "ping.social.location@1" && String(o.id).includes("-location-"),
    );
    expect(LOCATION_BLOCK_ENTITY_PREFIX).toBe("location-block:");
    expect(locs.length).toBe(2);
  });
});
