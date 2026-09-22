/**
 * Website observation tests: the extractor finds the real facts in page
 * HTML and labels every claim website_statement with full provenance.
 */
import assert from "node:assert/strict";
import { extractWebsiteClaims, extractRawFacts } from "../website-observe";

const ENTITY = "fyd:business:happy-place-carpentry";
const META = {
  url: "https://happy-place-platform.vercel.app/",
  observedAt: "2026-09-21T11:23:35.000Z",
  evidenceRef: "test-fixture",
};

const HTML =
  '<html><head><title>Happy Place Carpentry — Decks, Fences &amp; Remodels in the Willamette Valley</title>' +
  '<meta name="description" content="Licensed Oregon carpentry contractor (CCB# 254240) building decks, fences, pergolas, bathrooms, and custom work across Benton, Linn, Marion &amp; Polk Counties."/>' +
  '<meta property="og:title" content="Happy Place Carpentry — Decks, Fences &amp; Remodels in the Willamette Valley"/>' +
  "</head><body>" +
  "Decks, fences, repairs, remodels, finish carpentry, painting, and outdoor structures throughout Oregon's Mid-Willamette Valley." +
  "Mon–Fri 8am–5pm · Sat by appointment" +
  "Call 541-286-5190 or taylor@happyplacecarpentry.com | " +
  "Benton · Linn · Marion · Polk" +
  "Licensed · Insured · Est. 2024 · 125+ projects" +
  "</body></html>";

test("extracts the core business facts", () => {
  const facts = extractRawFacts(HTML);
  const byField = new Map(facts.map((f) => [f.field, f.value]));
  assert.equal(byField.get("name"), "Happy Place Carpentry");
  assert.ok((byField.get("description") || "").includes("CCB# 254240"));
  assert.ok((byField.get("hours") || "").includes("8am"));
  assert.equal(byField.get("phone"), "541-286-5190");
  assert.equal(byField.get("email"), "taylor@happyplacecarpentry.com");
  assert.equal(byField.get("license_ccb"), "CCB #254240");
  assert.ok((byField.get("service_area") || "").includes("Benton"));
  assert.equal(byField.get("established"), "2024");
});

test("every claim is website_statement with full provenance", () => {
  const claims = extractWebsiteClaims(HTML, ENTITY, META);
  assert.ok(claims.length >= 7);
  for (const c of claims) {
    assert.equal(c.grade, "website_statement");
    assert.equal(c.sourceKind, "website");
    assert.equal(c.sourceUrl, META.url);
    assert.equal(c.observedAt, META.observedAt);
    assert.ok(c.evidenceRef.length > 0);
    assert.ok(c.confidence > 0 && c.confidence <= 1);
    assert.ok(c.normalizedValue.length > 0);
    assert.equal(c.entityId, ENTITY);
  }
});

test("claim ids are deterministic for the same input", () => {
  const a = extractWebsiteClaims(HTML, ENTITY, META);
  const b = extractWebsiteClaims(HTML, ENTITY, META);
  assert.deepEqual(a.map((c) => c.claimId), b.map((c) => c.claimId));
});

test("empty page yields no claims, never fabricated ones", () => {
  const claims = extractWebsiteClaims("<html><body></body></html>", ENTITY, META);
  assert.deepEqual(claims, []);
});
