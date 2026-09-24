/**
 * LANE-REG: regeneration proof. Owner corrections survive regeneration.
 *
 * Procedure (from the lane task):
 *  1. Generate a SiteSpec from the validated second-site fixture
 *     (clearwater-plumbing-demo.json, 25 objects / 24 relationships,
 *     conflicting Saturday hours preserved). Record the digest.
 *  2. Record owner corrections through the corrections machinery,
 *     targeting the conflicting Saturday hours.
 *  3. Regenerate the SiteSpec from the SAME fixture (source refresh,
 *     fresh extraction clock). Record the digest.
 *  4. Replay the corrections journal over the regenerated facts.
 *     Assert: the correction still holds; no uncorrected fact changed
 *     unexpectedly; the supersession chain is intact.
 *  5. Determinism control: two fresh generations without corrections are
 *     byte-identical.
 *
 * All clocks are pinned. The only varying inputs across the regeneration
 * boundary are the extraction timestamp (T_FACT_1 -> T_FACT_2) and the
 * generator's pinned generatedAt (unchanged), which is exactly the
 * "source refresh" the machinery is built to survive.
 *
 * Run with: npx jest --config src/fyd/owner-mode/jest.config.cjs regen-proof
 */

import * as fs from "fs";
import * as path from "path";
import { createHash } from "crypto";
import { generateSiteSpec } from "../../proceduralize/generator";
import {
  applyCorrections,
  assertCorrection,
  type OwnerAssertion,
} from "../corrections";
import { extractSiteFacts, factIdFor, type SiteFact } from "../facts";
import { canonicalJson, demoProvenance } from "../provenance";
import type { ObjectGraph } from "../../sitespec/types";
import type { PingObject, PingRelationship } from "@/lib/ping/types";

// ---------------------------------------------------------------------------
// Pinned clocks: no real time anywhere in this proof.
// ---------------------------------------------------------------------------

const PIN_GENERATED_AT = "2026-09-24T00:30:00.000Z";
const T_FACT_1 = "2026-09-23T19:30:00.000Z";
const T_FACT_2 = "2026-09-23T20:00:00.000Z"; // simulated source refresh
const TA1 = "2026-09-23T20:05:00.000Z"; // first correction (superseded)
const TA2 = "2026-09-23T20:12:00.000Z"; // refined correction (chain head)
const TA3 = "2026-09-23T20:15:00.000Z"; // confirm + hide

// Owner's resolution of the Saturday-hours conflict:
// website said 12:00 PM close, GBP said 2:00 PM close; the owner's first
// pass said 1:00 PM, then the owner refined it to 12:30 PM.
const OWNER_HOURS_V1 =
  "Mon-Fri 7:00 AM - 6:00 PM; Sat 8:00 AM - 1:00 PM; Emergency service 24/7";
const OWNER_HOURS_V2 =
  "Mon-Fri 7:00 AM - 6:00 PM; Sat 8:00 AM - 12:30 PM; Emergency service 24/7";

function specDigestOfLocal(spec: unknown): string {
  return createHash("sha256").update(canonicalJson(spec), "utf8").digest("hex");
}

function loadFixtureGraph(): ObjectGraph {
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, "clearwater-plumbing-demo.json"), "utf8"),
  ) as {
    graph: { objects: unknown[]; relationships: unknown[] };
  };
  return {
    objects: raw.graph.objects as PingObject[],
    relationships: raw.graph.relationships as PingRelationship[],
  };
}

function factBy(graph: SiteFact[], objectId: string, field: string): SiteFact {
  const f = graph.find((x) => x.objectId === objectId && x.field === field);
  if (!f) throw new Error("fixture missing fact " + objectId + " : " + field);
  return f;
}

describe("LANE-REG regeneration proof", () => {
  const graph = loadFixtureGraph();

  test("fixture shape is the validated second site", () => {
    expect(graph.objects).toHaveLength(25);
    expect(graph.relationships).toHaveLength(24);
  });

  const facts1 = extractSiteFacts(graph, T_FACT_1);
  const spec1 = generateSiteSpec(graph, { generatedAt: PIN_GENERATED_AT });
  const digest1 = specDigestOfLocal(spec1);

  test("step 1: SiteSpec generates from the fixture; digest recorded", () => {
    expect(facts1.length).toBeGreaterThan(0);
    expect(spec1.ownerObjectId).toBe("cw-biz-01");
    expect(digest1).toMatch(/^[0-9a-f]{64}$/);
    // eslint-disable-next-line no-console
    console.log(
      "REG-PROOF digest1 (step 1 spec) = " + digest1 + " facts=" + facts1.length,
    );
  });

  // ---- Step 2: owner corrections through the corrections machinery ----
  const sourceHours = factBy(facts1, "cw-biz-01", "hours").value;
  const sourcePhone = factBy(facts1, "cw-biz-01", "phone").value;

  test("fixture really carries the Saturday conflict", () => {
    expect(sourceHours).toBe(
      "Mon-Fri 7:00 AM - 6:00 PM; Sat 8:00 AM - 12:00 PM; Emergency service 24/7",
    );
    expect(factBy(facts1, "cw-ext-gbp-01", "hours").value).toBe(
      "Mon-Fri 7:00 AM - 6:00 PM; Sat 8:00 AM - 2:00 PM; Emergency service 24/7",
    );
    expect(sourceHours).not.toBe(OWNER_HOURS_V2);
  });

  const A1 = assertCorrection({
    factRef: { objectId: "cw-biz-01", field: "hours" },
    op: "CORRECT",
    value: OWNER_HOURS_V1,
    provenance: demoProvenance(null, () => TA1),
    sourceValueSeen: sourceHours,
  });
  const A2 = assertCorrection({
    factRef: { objectId: "cw-biz-01", field: "hours" },
    op: "CORRECT",
    value: OWNER_HOURS_V2,
    provenance: demoProvenance(A1.assertionId, () => TA2),
    sourceValueSeen: sourceHours,
  });
  const A3 = assertCorrection({
    factRef: { objectId: "cw-biz-01", field: "phone" },
    op: "CONFIRM",
    provenance: demoProvenance(null, () => TA3),
    sourceValueSeen: sourcePhone,
  });
  const A4 = assertCorrection({
    factRef: { objectId: "cw-ext-gbp-01", field: "hours" },
    op: "HIDE",
    provenance: demoProvenance(null, () => TA3),
    sourceValueSeen: factBy(facts1, "cw-ext-gbp-01", "hours").value,
  });
  const journal: OwnerAssertion[] = [A1, A2, A3, A4];

  test("step 2: corrections recorded as an append-only journal", () => {
    // Append-only: nothing is edited or deleted; A2 names A1 as superseded.
    expect(journal).toHaveLength(4);
    expect(A1.provenance.supersedes).toBeNull();
    expect(A2.provenance.supersedes).toBe(A1.assertionId);
    // Deterministic ids under the pinned clock.
    const again = assertCorrection({
      factRef: { objectId: "cw-biz-01", field: "hours" },
      op: "CORRECT",
      value: OWNER_HOURS_V2,
      provenance: demoProvenance(A1.assertionId, () => TA2),
      sourceValueSeen: sourceHours,
    });
    expect(again.assertionId).toBe(A2.assertionId);
    // eslint-disable-next-line no-console
    console.log(
      "REG-PROOF journal = " +
        journal.map((a) => a.assertionId + ":" + a.op).join(", "),
    );
  });

  // ---- Step 3: regenerate from the SAME fixture (source refresh) ----
  const facts2 = extractSiteFacts(graph, T_FACT_2);
  const spec2 = generateSiteSpec(graph, { generatedAt: PIN_GENERATED_AT });
  const digest2 = specDigestOfLocal(spec2);

  test("step 3: regenerated SiteSpec digest matches the original", () => {
    expect(digest2).toBe(digest1);
    // eslint-disable-next-line no-console
    console.log("REG-PROOF digest2 (step 3 spec) = " + digest2);
  });

  // ---- Step 4: replay corrections over the regenerated facts ----
  const result = applyCorrections(facts2, journal);
  const hoursFactId = factIdFor("cw-biz-01", "hours", 0);
  const gbpHoursFactId = factIdFor("cw-ext-gbp-01", "hours", 0);
  const phoneFactId = factIdFor("cw-biz-01", "phone", 0);
  const projected = new Map(result.facts.map((f) => [f.factId, f] as const));

  test("step 4a: the owner correction still holds after regeneration", () => {
    expect(projected.get(hoursFactId)?.value).toBe(OWNER_HOURS_V2);
  });

  test("step 4b: no uncorrected fact changed unexpectedly", () => {
    // The source refresh itself is value-identical: only the extraction
    // clock moved (T_FACT_1 -> T_FACT_2); every (factId, value, kind) pair
    // is unchanged.
    const key = (f: SiteFact) =>
      f.factId + "|" + f.objectId + "|" + f.field + "|" + f.index + "|" + f.value + "|" + f.kind;
    expect(facts2.map(key)).toEqual(facts1.map(key));

    // The projection changes nothing it was not asked to change: every
    // fact the journal does not address carries the regenerated source value.
    const addressed = new Set([hoursFactId, gbpHoursFactId, phoneFactId]);
    const sourceById = new Map(facts2.map((f) => [f.factId, f.value] as const));
    const unexpected: string[] = [];
    for (const f of result.facts) {
      const expected = sourceById.get(f.factId);
      if (expected === undefined) {
        unexpected.push(f.factId + " (not in regenerated extraction)");
        continue;
      }
      if (!addressed.has(f.factId) && f.value !== expected) {
        unexpected.push(f.factId + " changed without an assertion");
      }
    }
    expect(unexpected).toEqual([]);
    // The only value edits are the corrected hours fact.
    const valueDiffs = result.facts.filter(
      (f) => f.value !== sourceById.get(f.factId),
    );
    expect(valueDiffs.map((f) => f.factId)).toEqual([hoursFactId]);
    // HIDE does not edit the value of the hidden fact.
    expect(projected.get(gbpHoursFactId)?.value).toBe(
      sourceById.get(gbpHoursFactId),
    );
    // CONFIRM does not edit the value; it stamps the confirmation.
    expect(projected.get(phoneFactId)?.value).toBe(sourcePhone);
    expect(projected.get(phoneFactId)?.ownerConfirmation).toEqual({
      owner: A3.provenance.owner,
      assertedAt: TA3,
    });
  });

  test("step 4c: the supersession chain is intact", () => {
    // A1 is retained (append-only) but superseded; only the head applies.
    expect(journal.map((a) => a.assertionId)).toContain(A1.assertionId);
    const appliedIds = result.applied.map((a) => a.assertionId);
    expect(appliedIds).toContain(A2.assertionId);
    expect(appliedIds).not.toContain(A1.assertionId);
    expect(appliedIds).toContain(A3.assertionId);
    expect(appliedIds).toContain(A4.assertionId);
    // The chain head's value, not the superseded one's, is the projection.
    expect(projected.get(hoursFactId)?.value).toBe(OWNER_HOURS_V2);
    expect(projected.get(hoursFactId)?.value).not.toBe(OWNER_HOURS_V1);
  });

  test("step 4d: conflict and orphan accounting is clean", () => {
    // The source did not move on any asserted field, so there is no
    // conflict and no orphaned assertion: the replay is total.
    expect(result.conflicts).toEqual([]);
    expect(result.orphaned).toEqual([]);
    expect(result.hiddenFactIds).toEqual([gbpHoursFactId]);
  });

  // ---- Step 5: determinism control ----
  test("step 5: two fresh generations without corrections are byte-identical", () => {
    const freshA = generateSiteSpec(graph, { generatedAt: PIN_GENERATED_AT });
    const freshB = generateSiteSpec(graph, { generatedAt: PIN_GENERATED_AT });
    expect(canonicalJson(freshA)).toBe(canonicalJson(freshB));
    expect(specDigestOfLocal(freshA)).toBe(digest1);
    const factsA = extractSiteFacts(graph, T_FACT_1);
    const factsB = extractSiteFacts(graph, T_FACT_1);
    expect(factsB).toEqual(factsA);
  });
});
