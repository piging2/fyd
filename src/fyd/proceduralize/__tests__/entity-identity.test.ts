/**
 * G2 hostile test: OBJECT ID STABILITY.
 *
 * Corrected identity model (2026-09-24): stable ENTITY IDENTITY +
 * evolving OBSERVATIONS. The business id derives ONLY from the canonical
 * entity URL. Runner label, run id, observation ids, content fields, and
 * pipeline version are provenance, never identity.
 *
 * PASS/FAIL gate: same source + different runner -> SAME id; changed
 * phone/description -> SAME id; different business URL -> DIFFERENT id.
 */

import { canonicalEntityUrl, runExtractionPipeline } from "../proceduralizer";

const TS = "2026-09-24T12:00:00.000Z";

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

function html(phone: string, description: string, canonicalUrl = "https://bemiselectric.com/"): string {
  return `<!DOCTYPE html><html><head>
<title>Bemis Electric</title>
<meta property="og:title" content="Bemis Electric" />
<meta property="og:description" content="${description}" />
<meta property="og:url" content="${canonicalUrl}" />
</head><body>
<h1>Bemis Electric</h1>
<p>${description}</p>
<p>Call us: <a href="tel:${phone}">${phone}</a></p>
<address>123 Main St, Grand Junction, CO 81501</address>
</body></html>`;
}

async function businessId(
  controllerId: string,
  sourceUrl: string,
  phone: string,
  description: string,
): Promise<string> {
  const out = await runExtractionPipeline([page(sourceUrl, html(phone, description))], {
    sourceUrl,
    observedAt: TS,
    controllerId,
  } as never);
  const biz = out.graph.objects.find((o) => o.schema === "ping.social.business@1");
  if (!biz) throw new Error("no business object generated");
  return biz.id;
}

describe("canonicalEntityUrl", () => {
  test("normalizes www, case, trailing slash, query, fragment, default port", () => {
    const a = canonicalEntityUrl("https://bemiselectric.com/");
    expect(canonicalEntityUrl("https://www.bemiselectric.com/")).toBe(a);
    expect(canonicalEntityUrl("HTTPS://BEMISElectric.COM/?utm_source=x#top")).toBe(a);
    expect(canonicalEntityUrl("https://bemiselectric.com:443/")).toBe(a);
    expect(canonicalEntityUrl("https://bemiselectric.com")).toBe(a);
  });
  test("different hosts and paths stay distinct", () => {
    expect(canonicalEntityUrl("https://a.example.com/")).not.toBe(
      canonicalEntityUrl("https://b.example.com/"),
    );
    expect(canonicalEntityUrl("https://a.example.com/x")).not.toBe(
      canonicalEntityUrl("https://a.example.com/y"),
    );
  });
  test("never throws; unparseable input is returned trimmed", () => {
    expect(canonicalEntityUrl("not a url")).toBe("not a url");
  });
});

describe("business entity id stability (hostile)", () => {
  test("same source, different runner -> SAME id", async () => {
    const a = await businessId("runner-alpha", "https://bemiselectric.com/", "555-0100", "Family-run electricians.");
    const b = await businessId("runner-beta", "https://bemiselectric.com/", "555-0100", "Family-run electricians.");
    expect(a).toMatch(/^website-business-[0-9a-f]{16}$/);
    expect(b).toBe(a);
  });

  test("changed phone and description do NOT remint the business", async () => {
    const a = await businessId("runner-alpha", "https://bemiselectric.com/", "555-0100", "Family-run electricians.");
    const b = await businessId("runner-alpha", "https://bemiselectric.com/", "555-9999", "Completely rewritten description with new services.");
    expect(b).toBe(a);
  });

  test("seed-URL variants of the same site resolve to the SAME entity", async () => {
    const a = await businessId("runner-alpha", "https://bemiselectric.com/", "555-0100", "Family-run electricians.");
    const b = await businessId("runner-beta", "https://www.bemiselectric.com/?utm_campaign=x", "555-0100", "Family-run electricians.");
    expect(b).toBe(a);
  });

  test("different business -> different id", async () => {
    const a = await businessId("runner-alpha", "https://bemiselectric.com/", "555-0100", "Family-run electricians.");
    // Different seed AND different self-declared canonical -> different entity.
    const out = await runExtractionPipeline(
      [page("https://gearjunction.example.com/", html("555-0100", "Bike shop.", "https://gearjunction.example.com/"))],
      { sourceUrl: "https://gearjunction.example.com/", observedAt: TS, controllerId: "runner-alpha" } as never,
    );
    const b = out.graph.objects.find((o) => o.schema === "ping.social.business@1")!.id;
    expect(b).not.toBe(a);
  });

  test("site-declared canonical URL wins over the seed URL (owner claim resolves the entity)", async () => {
    // Seed says gearjunction, but the page declares itself bemiselectric:
    // the entity resolves to the declared canonical.
    const out = await runExtractionPipeline(
      [page("https://gearjunction.example.com/", html("555-0100", "Bike shop.", "https://bemiselectric.com/"))],
      { sourceUrl: "https://gearjunction.example.com/", observedAt: TS, controllerId: "runner-alpha" } as never,
    );
    const b = out.graph.objects.find((o) => o.schema === "ping.social.business@1")!.id;
    const a = await businessId("runner-beta", "https://bemiselectric.com/", "555-0100", "Family-run electricians.");
    expect(b).toBe(a);
  });

  test("runner stays in provenance, not in identity", async () => {
    const out = await runExtractionPipeline(
      [page("https://bemiselectric.com/", html("555-0100", "Family-run electricians."))],
      { sourceUrl: "https://bemiselectric.com/", observedAt: TS, controllerId: "runner-gamma" } as never,
    );
    const biz = out.graph.objects.find((o) => o.schema === "ping.social.business@1")!;
    expect(biz.controllerId).toBe("runner-gamma");
    // The id must be derivable from the entity URL alone (no runner input).
    const { createHash } = await import("node:crypto");
    const expected =
      "website-business-" +
      createHash("sha256").update(canonicalEntityUrl("https://bemiselectric.com/"), "utf8").digest("hex").slice(0, 16);
    expect(biz.id).toBe(expected);
  });
});
