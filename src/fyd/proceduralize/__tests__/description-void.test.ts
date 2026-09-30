/**
 * Tests for the name-vs-description sanity rule (2026-09-30):
 * an og/meta description that names a DIFFERENT business than the page
 * is VOIDED (never emitted). Voiding only: nothing invented/rewritten.
 */
import {
  descriptionNamesForeignBusiness,
  parseRich,
  type AcquiredSource,
} from "../proceduralizer";

const NOW = "2026-09-30T12:00:00.000Z";

function acquiredHtml(raw: string): AcquiredSource {
  return {
    url: "https://example.com/",
    sourceType: "html",
    discoveredAt: NOW,
    raw,
    ok: true,
    status: 200,
  };
}

describe("descriptionNamesForeignBusiness", () => {
  test("Kim's case: description names A&D Auto Parts, page is Kim's Auto Parts", () => {
    expect(
      descriptionNamesForeignBusiness(
        "Known for bringing a personal touch, reliability, competitive pricing, and outstanding products to your door, A&D Auto Parts is far and away the best place to bring your business.",
        "Kims - Kims Auto Parts",
      ),
    ).toBe(true);
  });

  test("Kim's case still fires through HTML entities (A&amp;D)", () => {
    expect(
      descriptionNamesForeignBusiness(
        "Known for bringing a personal touch, A&amp;D Auto Parts is far and away the best place to bring your business.",
        "Kims - Kims Auto Parts",
      ),
    ).toBe(true);
  });

  test("legit negative: description names the page business", () => {
    expect(
      descriptionNamesForeignBusiness(
        "Kims Auto Parts has served Fruita families with a personal touch since 1995.",
        "Kims - Kims Auto Parts",
      ),
    ).toBe(false);
  });

  test("legit negative: Elevation description with descriptors and place names", () => {
    expect(
      descriptionNamesForeignBusiness(
        "Elevation Family Dental | Exceptional Dentistry by a Gentle Dentist located in Grand Junction, CO. Delivering compassionate dental care to you and your family.",
        "Elevation Family Dental | Dentist in Grand Junction, CO",
      ),
    ).toBe(false);
  });

  test("legit negative: Bin707 description with place phrase", () => {
    expect(
      descriptionNamesForeignBusiness(
        "Bin 707 Foodbar is a casual, full-service restaurant serving seasonal American cuisine from local, Colorado and domestic sources located in Downtown Grand Junction, Colorado.",
        "Bin 707 Foodbar",
      ),
    ).toBe(false);
  });

  test("empty page title: nothing to check against, never voids", () => {
    expect(
      descriptionNamesForeignBusiness(
        "A&D Auto Parts is far and away the best place.",
        "",
      ),
    ).toBe(false);
  });

  test("deterministic: same inputs, same output", () => {
    const d =
      "Known for bringing a personal touch, A&D Auto Parts is the best.";
    const t = "Kims - Kims Auto Parts";
    expect(descriptionNamesForeignBusiness(d, t)).toBe(
      descriptionNamesForeignBusiness(d, t),
    );
  });
});

describe("parseRich description voiding", () => {
  test("voids the og:description fact for the Kim's case, keeps og:title", async () => {
    const html = `<!DOCTYPE html><html><head>
<title>Kims - Kims Auto Parts</title>
<meta property="og:title" content="Kims - Kims Auto Parts" />
<meta property="og:description" content="Known for bringing a personal touch, reliability, competitive pricing, and outstanding products to your door, A&amp;D Auto Parts is far and away the best place to bring your business." />
<meta property="og:url" content="https://kimsautopart.com/" />
</head><body><h1>Kims</h1></body></html>`;
    const { facts } = await parseRich(acquiredHtml(html));
    expect(facts.some((f) => f.name === "description")).toBe(false);
    expect(facts.some((f) => f.name === "title")).toBe(true);
  });

  test("voids the meta name=description fact too", async () => {
    const html = `<!DOCTYPE html><html><head>
<title>Kims - Kims Auto Parts</title>
<meta name="description" content="A&D Auto Parts is far and away the best place to bring your business." />
</head><body><h1>Kims</h1></body></html>`;
    const { facts } = await parseRich(acquiredHtml(html));
    expect(facts.some((f) => f.name === "description")).toBe(false);
  });

  test("keeps a legitimate description", async () => {
    const html = `<!DOCTYPE html><html><head>
<title>Elevation Family Dental | Dentist in Grand Junction, CO</title>
<meta property="og:description" content="Elevation Family Dental | Exceptional Dentistry by a Gentle Dentist located in Grand Junction, CO." />
</head><body><h1>Elevation</h1></body></html>`;
    const { facts } = await parseRich(acquiredHtml(html));
    const desc = facts.find((f) => f.name === "description");
    expect(desc).toBeDefined();
    expect(String(desc!.value)).toContain("Elevation Family Dental");
  });

  test("structured (JSON-LD) descriptions are untouched by the void rule", async () => {
    const html = `<!DOCTYPE html><html><head>
<title>Kims - Kims Auto Parts</title>
<meta property="og:description" content="A&D Auto Parts is far and away the best place to bring your business." />
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"AutoPartsStore","name":"Kims Auto Parts","description":"Independent auto parts store in Fruita."}
</script>
</head><body><h1>Kims</h1></body></html>`;
    const { facts } = await parseRich(acquiredHtml(html));
    const structured = facts.find(
      (f) => f.name === "description" && f.sourceType === "json-ld",
    );
    expect(structured).toBeDefined();
  });
});
