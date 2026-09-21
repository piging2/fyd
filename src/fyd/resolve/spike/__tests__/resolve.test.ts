/**
 * Entity-resolution spike tests (spike-1). node:test, deterministic.
 *
 * Real-data provenance: the EXACT/AMBIGUOUS/UNMATCHED cases below use
 * verbatim rows from the PING Social outreach pipeline
 * (~/workspace/outreach, 2026-09-21) and the committed Coppersmith
 * proceduralizer fixture. Only the exact-name-address pair is synthetic,
 * labeled as such, because the real corpus contains no street addresses.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import type { ResolveEntity } from "../types.ts";
import {
  normalizeAddress,
  normalizeCity,
  normalizeName,
  normalizePhone,
  normalizeUrl,
  urlHost,
} from "../normalize.ts";
import { exactPhone, exactUrl, pairScore } from "../matchers.ts";
import { buildIndex, resolveAll, tierCounts } from "../resolve.ts";
import { COPPERSMITH_GRAPH } from "../../../proceduralize/__fixtures__/coppersmith-graph.ts";

const AT = "2026-09-21T00:00:00.000Z";

// --- Verbatim real rows -------------------------------------------------
// Round 53 meta-AI intel (jsonl-additions-round53-meta.jsonl), verified 2026-09-14.
const COPPERSMITH_ROUND53: ResolveEntity = {
  id: "round53:coppersmith",
  name: "Coppersmith Plumbing & HVAC",
  phone: "970-245-3869",
  url: "http://www.coppersmithplumbing.com/",
  city: "Grand Junction",
  trade: "plumbing and HVAC",
};
// Round 40 research (jsonl-additions-round40-research.jsonl).
const MARTINS_PAINTING: ResolveEntity = {
  id: "round40:martins-painting",
  name: "Martin's Painting",
  phone: "(970) 275-9999",
  url: "http://www.martinspainting.net",
  city: "Montrose",
  trade: "painting contractor",
};
// Canonical pipeline (western-co-prospects.jsonl).
const RJS_PAINTING: ResolveEntity = {
  id: "corpus:rjs-painting",
  name: "RJ's Painting",
  phone: "(970) 249-2137",
  url: "http://rjspainting.com/",
  city: "Montrose",
  trade: "painting contractor",
};

function fixtureCoppersmith(): ResolveEntity {
  const o = COPPERSMITH_GRAPH.objects[0];
  const f = o.fields as Record<string, string>;
  return { id: "fixture:coppersmith", name: f["title"], url: f["website"] };
}

// --- Normalization -------------------------------------------------------

test("normalizeUrl strips scheme, www, trailing junk; keeps the path", () => {
  assert.equal(normalizeUrl("http://www.coppersmithplumbing.com/"), "coppersmithplumbing.com");
  assert.equal(normalizeUrl("https://www.coppersmithplumbing.com/"), "coppersmithplumbing.com");
  // Real ";" artifact observed in western-co-prospects.jsonl (2026-09-21).
  assert.equal(normalizeUrl("https://cillessenconstruction.com/contact;"), "cillessenconstruction.com/contact");
  assert.equal(normalizeUrl("https://example.com/page?x=1#frag"), "example.com/page");
  assert.equal(normalizeUrl(""), "");
});

test("normalizeUrl keeps /contact distinct from / (host signal is separate)", () => {
  assert.notEqual(normalizeUrl("https://example.com/contact"), normalizeUrl("https://example.com/"));
  assert.equal(urlHost("https://example.com/contact"), urlHost("https://example.com/"));
});

test("normalizePhone returns 10 digits or empty, never coerced", () => {
  assert.equal(normalizePhone("(970) 245-3869"), "9702453869");
  assert.equal(normalizePhone("970-245-3869"), "9702453869");
  assert.equal(normalizePhone("+15412865190"), "5412865190"); // real Happy Place fixture phone
  assert.equal(normalizePhone(""), "");
  assert.equal(normalizePhone("555-1234"), ""); // not a 10-digit NANP number: UNKNOWN
});

test("normalizeName drops case, punctuation, legal suffixes; & -> and", () => {
  assert.equal(normalizeName("Coppersmith Plumbing & HVAC"), "coppersmith plumbing and hvac");
  assert.equal(normalizeName("Kaylor Fencing LLC"), "kaylor fencing");
  assert.equal(normalizeName("Alpine Fencing & Supplies, Inc."), "alpine fencing and supplies");
  assert.equal(normalizeName(""), "");
});

test("normalizeAddress expands street abbreviations but keeps suite tokens", () => {
  assert.equal(normalizeAddress("123 Main St Ste 4"), "123 main street suite 4");
  assert.notEqual(normalizeAddress("123 Main St Ste 4"), normalizeAddress("123 Main St Ste 5"));
});

test("normalizeCity is case- and punctuation-insensitive", () => {
  assert.equal(normalizeCity("Grand Junction"), normalizeCity("grand junction"));
});

// --- EXACT tier ----------------------------------------------------------

test("EXACT: fixture Coppersmith matches round-53 row via exact-url despite different names", () => {
  const fixture = fixtureCoppersmith();
  assert.equal(fixture.name, "Coppersmith Plumbing");
  assert.equal(exactUrl(fixture, COPPERSMITH_ROUND53), "coppersmithplumbing.com");
  const decisions = resolveAll([fixture], [COPPERSMITH_ROUND53], {
    corpusRef: "test-corpus@1",
    evaluatedAt: AT,
  });
  const d = decisions[0];
  assert.equal(d.tier, "EXACT");
  if (d.tier !== "EXACT") throw new Error("unreachable");
  assert.equal(d.rule, "exact-url");
  assert.deepEqual(d.matchedIds, ["round53:coppersmith"]);
  assert.deepEqual(d.evidence, { "exact-url": "coppersmithplumbing.com" });
});

test("EXACT: exact-phone probe matches real phone spellings", () => {
  const a: ResolveEntity = { id: "a", name: "Coppersmith Plumbing & HVAC", phone: "970-245-3869" };
  const b: ResolveEntity = { id: "b", name: "Coppersmith Plumbing", phone: "(970) 245-3869" };
  assert.equal(exactPhone(a, b), "9702453869");
  const decisions = resolveAll([a], [b], { corpusRef: "t@1", evaluatedAt: AT });
  assert.equal(decisions[0].tier, "EXACT");
  if (decisions[0].tier !== "EXACT") throw new Error("unreachable");
  assert.equal(decisions[0].rule, "exact-phone");
});

test("EXACT: exact-name-address needs both name and full address (synthetic pair)", () => {
  const a: ResolveEntity = { id: "a", name: "Acme Plumbing LLC", address: "123 Main St Ste 4, Grand Junction CO" };
  const b: ResolveEntity = { id: "b", name: "Acme Plumbing", address: "123 Main Street Suite 4, Grand Junction CO" };
  const c: ResolveEntity = { id: "c", name: "Acme Plumbing", address: "123 Main Street Suite 5, Grand Junction CO" };
  const decisions = resolveAll([a], [b, c], { corpusRef: "t@2", evaluatedAt: AT });
  const d = decisions[0];
  assert.equal(d.tier, "EXACT");
  if (d.tier !== "EXACT") throw new Error("unreachable");
  assert.equal(d.rule, "exact-name-address");
  assert.deepEqual(d.matchedIds, ["b"]); // suite 5 must not match
});

test("EXACT: empty fields never match (unknown is not evidence)", () => {
  const a: ResolveEntity = { id: "a", name: "No Phone Co" };
  const b: ResolveEntity = { id: "b", name: "No Phone Co" };
  const decisions = resolveAll([a], [b], { corpusRef: "t@1", evaluatedAt: AT });
  // Same normalized name but no URL/phone/address: not an exact rule.
  assert.notEqual(decisions[0].tier, "EXACT");
});

// --- AMBIGUOUS tier -------------------------------------------------------

test("AMBIGUOUS: Martin's Painting vs RJ's Painting is isolated, never merged", () => {
  const decisions = resolveAll([MARTINS_PAINTING], [RJS_PAINTING], {
    corpusRef: "western-co-prospects.jsonl@318",
    evaluatedAt: AT,
  });
  const d = decisions[0];
  assert.equal(d.tier, "AMBIGUOUS");
  if (d.tier !== "AMBIGUOUS") throw new Error("unreachable");
  assert.equal(d.action, "intelligence-review");
  assert.ok(d.candidates.length >= 1);
  assert.equal(d.candidates[0].id, "corpus:rjs-painting");
  assert.ok(d.candidates[0].score >= 0.5);
  assert.ok(d.candidates[0].score < 1);
  // The never-auto-merge invariant: no matchedIds field exists on this tier.
  assert.ok(!("matchedIds" in d));
});

test("AMBIGUOUS: pairScore exposes per-feature evidence for the reviewer", () => {
  const { score, features } = pairScore(MARTINS_PAINTING, RJS_PAINTING);
  assert.ok(score >= 0.5 && score <= 1);
  assert.equal(features.sameCity, true);
  assert.equal(features.sameUrlHost, false);
  assert.equal(features.phoneAreaMatch, false);
});

// --- UNMATCHED tier -------------------------------------------------------

test("UNMATCHED: distinct businesses with no corroborating signal are reported honestly", () => {
  const decisions = resolveAll([MARTINS_PAINTING], [COPPERSMITH_ROUND53], {
    corpusRef: "western-co-prospects.jsonl@318",
    evaluatedAt: AT,
  });
  const d = decisions[0];
  assert.equal(d.tier, "UNMATCHED");
  assert.ok(!("matchedIds" in d));
  assert.ok(!("candidates" in d));
});

// --- Provenance and determinism ------------------------------------------

test("every decision carries provenance", () => {
  const corpus = [COPPERSMITH_ROUND53, RJS_PAINTING];
  const candidates = [fixtureCoppersmith(), MARTINS_PAINTING];
  const decisions = resolveAll(candidates, corpus, {
    corpusRef: "western-co-prospects.jsonl@318",
    evaluatedAt: AT,
  });
  for (const d of decisions) {
    assert.ok(d.provenance.candidateId);
    assert.equal(d.provenance.corpusRef, "western-co-prospects.jsonl@318");
    assert.equal(d.provenance.evaluatedAt, AT);
    assert.equal(d.provenance.normalizerVersion, "spike-1");
    assert.ok(d.provenance.mechanism.length > 0);
  }
});

test("resolution is deterministic across runs", () => {
  const corpus = [COPPERSMITH_ROUND53, RJS_PAINTING];
  const candidates = [fixtureCoppersmith(), MARTINS_PAINTING];
  const opts = { corpusRef: "western-co-prospects.jsonl@318", evaluatedAt: AT } as const;
  const once = resolveAll(candidates, corpus, opts);
  const twice = resolveAll(candidates, corpus, opts);
  assert.deepEqual(once, twice);
});

test("tierCounts sums to the candidate count", () => {
  const corpus = [COPPERSMITH_ROUND53, RJS_PAINTING];
  const candidates = [fixtureCoppersmith(), MARTINS_PAINTING];
  const counts = tierCounts(
    resolveAll(candidates, corpus, { corpusRef: "t@2", evaluatedAt: AT }),
  );
  assert.equal(counts.EXACT + counts.AMBIGUOUS + counts.UNMATCHED, candidates.length);
  assert.equal(counts.EXACT, 1);
  assert.equal(counts.AMBIGUOUS, 1);
  assert.equal(counts.UNMATCHED, 0);
});
