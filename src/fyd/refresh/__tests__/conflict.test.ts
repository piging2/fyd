/**
 * Conflict detection tests: disagreements across sources are recorded with
 * both claims kept; identical values and single sources produce nothing.
 */
import assert from "node:assert/strict";
import type { Claim } from "../types";
import { detectConflicts, resolveConflict } from "../conflict";
import { syntheticFacebookObservation } from "../facebook-source";
import { extractWebsiteClaims } from "../website-observe";

const ENTITY = "fyd:business:happy-place-carpentry";
const T = "2026-09-21T11:23:35.000Z";

function webClaim(field: string, value: string): Claim {
  const norm = value.toLowerCase().trim();
  return {
    claimId: "web-" + field + "-" + norm.replace(/[^a-z0-9]/g, "").slice(0, 8),
    entityId: ENTITY,
    field,
    value,
    normalizedValue: norm,
    sourceKind: "website",
    sourceUrl: "https://happy-place-platform.vercel.app/",
    observedAt: T,
    evidenceRef: "test",
    confidence: 0.9,
    grade: "website_statement",
    label: "T2-real",
  };
}

test("conflict detected on hours disagreement, both claims kept", () => {
  const website = [webClaim("hours", "Mon-Fri 8am-5pm")];
  const fb = syntheticFacebookObservation(ENTITY, T).claims.filter((c) => c.field === "hours");
  const conflicts = detectConflicts([...website, ...fb], T);
  assert.equal(conflicts.length, 1);
  const c = conflicts[0];
  assert.equal(c.entityId, ENTITY);
  assert.equal(c.field, "hours");
  assert.equal(c.status, "open");
  assert.equal(c.claims.length, 2);
  const values = c.claims.map((k) => k.value).sort();
  assert.deepEqual(values, ["Mon-Fri 8am-5pm", "Mon-Fri 9am-5pm"]);
  assert.ok(c.surfaceText.includes("Mon-Fri 8am-5pm"));
  assert.ok(c.surfaceText.includes("Mon-Fri 9am-5pm"));
});

test("agreement across sources produces no conflict", () => {
  const website = [webClaim("name", "Happy Place Carpentry"), webClaim("phone", "541-286-5190")];
  const fb = syntheticFacebookObservation(ENTITY, T).claims.filter(
    (c) => c.field === "name" || c.field === "phone",
  );
  const conflicts = detectConflicts([...website, ...fb], T);
  assert.equal(conflicts.length, 0);
});

test("single source never conflicts with itself", () => {
  const website = [webClaim("hours", "Mon-Fri 8am-5pm"), webClaim("name", "Happy Place Carpentry")];
  const conflicts = detectConflicts(website, T);
  assert.equal(conflicts.length, 0);
});

test("resolution records the human decision and keeps the losing claim", () => {
  const website = [webClaim("hours", "Mon-Fri 8am-5pm")];
  const fb = syntheticFacebookObservation(ENTITY, T).claims.filter((c) => c.field === "hours");
  const [conflict] = detectConflicts([...website, ...fb], T);
  const resolved = resolveConflict(conflict, website[0].claimId, "nolan", T, "website is canonical for hours");
  assert.equal(resolved.status, "resolved");
  assert.equal(resolved.resolution && resolved.resolution.winningClaimId, website[0].claimId);
  assert.equal(resolved.resolution && resolved.resolution.decidedBy, "nolan");
  // losing claim still present in the record
  assert.equal(resolved.claims.length, 2);
});

test("resolveConflict rejects an unknown winning claim id", () => {
  const website = [webClaim("hours", "Mon-Fri 8am-5pm")];
  const fb = syntheticFacebookObservation(ENTITY, T).claims.filter((c) => c.field === "hours");
  const [conflict] = detectConflicts([...website, ...fb], T);
  assert.throws(() => resolveConflict(conflict, "nope", "nolan", T, "x"), /not one of the conflict/);
});

test("conflicts are deterministic across runs", () => {
  const claims = [
    ...extractWebsiteClaims(
      '<html><head><title>Happy Place Carpentry — Decks</title>' +
        '<meta name="description" content="Licensed Oregon carpentry contractor (CCB# 254240)."/></head>' +
        "<body>Mon–Fri 8am–5pm · Sat by appointment 541-286-5190</body></html>",
      ENTITY,
      { url: "https://happy-place-platform.vercel.app/", observedAt: T, evidenceRef: "test" },
    ),
    ...syntheticFacebookObservation(ENTITY, T).claims,
  ];
  const a = detectConflicts(claims, T).map((c) => c.conflictId);
  const b = detectConflicts(claims, T).map((c) => c.conflictId);
  assert.deepEqual(a, b);
});
