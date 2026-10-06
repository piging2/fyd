/**
 * INV-06: owner correction survives reobservation.
 *
 * Machinery under test (real, on the Pig):
 *   src/fyd/owner-mode/facts.ts       extractSiteFacts
 *   src/fyd/owner-mode/corrections.ts assertCorrection / applyCorrections
 *
 * Relationship to adjacent lanes: LANE-REG proved the replay over a
 * VALUE-IDENTICAL source refresh (only the extraction clock moved).
 * This probe EXTENDS it into the cases LANE-REG did not cover:
 * the source MOVES under the correction. The law: the owner's value
 * stays applied AND the conflict is surfaced with both values (never
 * a silent win for either side). When the source adopts the owner's
 * value, the assertion is satisfied with no conflict.
 */

import {
  applyCorrections,
  assertCorrection,
} from "../../owner-mode/corrections";
import { extractSiteFacts, factIdFor } from "../../owner-mode/facts";
import { demoProvenance } from "../../owner-mode/provenance";
import type { ObjectGraph } from "../../sitespec/types";
import { T0, clearwaterGraph, objectById } from "./support";

const T1 = "2026-09-23T19:30:00.000Z";
const T2 = "2026-09-23T20:00:00.000Z"; // source refresh, values unchanged
const T3 = "2026-09-23T21:00:00.000Z"; // source refresh, source MOVED
const TA = "2026-09-23T20:05:00.000Z";

const OWNER_HOURS =
  "Mon-Fri 7:00 AM - 6:00 PM; Sat 8:00 AM - 12:30 PM; Emergency service 24/7";
const SOURCE_HOURS_ORIG =
  "Mon-Fri 7:00 AM - 6:00 PM; Sat 8:00 AM - 12:00 PM; Emergency service 24/7";
const SOURCE_HOURS_MOVED = "Mon-Fri 8:00 AM - 5:00 PM; Sat 9:00 AM - 12:00 PM";

function graphWithHours(hours: string): ObjectGraph {
  const g = clearwaterGraph();
  const biz = objectById(g, "cw-biz-01");
  biz.fields = { ...biz.fields, hours };
  return g;
}

describe("INV-06 owner correction survives reobservation", () => {
  const hoursFactId = factIdFor("cw-biz-01", "hours", 0);

  const correction = assertCorrection({
    factRef: { objectId: "cw-biz-01", field: "hours" },
    op: "CORRECT",
    value: OWNER_HOURS,
    provenance: demoProvenance(null, () => TA),
    sourceValueSeen: SOURCE_HOURS_ORIG,
  });

  test("reobservation, source unchanged: correction holds, no conflict", () => {
    const facts = extractSiteFacts(clearwaterGraph(), T2);
    const r = applyCorrections(facts, [correction]);
    const byId = new Map(r.facts.map((f) => [f.factId, f] as const));
    expect(byId.get(hoursFactId)?.value).toBe(OWNER_HOURS);
    expect(r.conflicts).toEqual([]);
    expect(r.orphaned).toEqual([]);
  });

  test("reobservation, source MOVED: owner value stays applied AND conflict is explicit", () => {
    const facts = extractSiteFacts(graphWithHours(SOURCE_HOURS_MOVED), T3);
    const r = applyCorrections(facts, [correction]);
    const byId = new Map(r.facts.map((f) => [f.factId, f] as const));
    // The owner's value stays applied: corrections survive regen.
    expect(byId.get(hoursFactId)?.value).toBe(OWNER_HOURS);
    // The conflict is explicit, never a silent win for either side.
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toMatchObject({
      factRef: { objectId: "cw-biz-01", field: "hours", index: 0 },
      sourceValue: SOURCE_HOURS_MOVED,
      ownerValue: OWNER_HOURS,
    });
    expect(r.conflicts[0].reason).toMatch(/owner's value stays applied/i);
  });

  test("reobservation, source ADOPTED the owner value: satisfied, no conflict", () => {
    const facts = extractSiteFacts(graphWithHours(OWNER_HOURS), T3);
    const r = applyCorrections(facts, [correction]);
    const byId = new Map(r.facts.map((f) => [f.factId, f] as const));
    expect(byId.get(hoursFactId)?.value).toBe(OWNER_HOURS);
    expect(r.conflicts).toEqual([]);
  });

  test("CONFIRM + source moved: conflict surfaced, nothing silently changed", () => {
    const phoneFactId = factIdFor("cw-biz-01", "phone", 0);
    const confirm = assertCorrection({
      factRef: { objectId: "cw-biz-01", field: "phone" },
      op: "CONFIRM",
      provenance: demoProvenance(null, () => TA),
      sourceValueSeen: "(970) 555-0142",
    });
    const g = clearwaterGraph();
    const biz = objectById(g, "cw-biz-01");
    biz.fields = { ...biz.fields, phone: "(970) 555-9999" };
    const r = applyCorrections(extractSiteFacts(g, T3), [confirm]);
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toMatchObject({
      sourceValue: "(970) 555-9999",
      ownerValue: "(970) 555-0142",
    });
    // The confirmation is stale; the projection changes nothing.
    const byId = new Map(r.facts.map((f) => [f.factId, f] as const));
    expect(byId.get(phoneFactId)?.value).toBe("(970) 555-9999");
    expect(byId.get(phoneFactId)?.ownerConfirmation).toBeUndefined();
  });

  test("T1 is pinned (no clock in test inputs)", () => {
    expect(T1).toBe(T0);
  });
});
