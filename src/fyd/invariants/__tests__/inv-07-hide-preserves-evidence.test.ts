/**
 * INV-07: owner hide does not delete evidence.
 *
 * Machinery under test (real, on the Pig):
 *   src/fyd/owner-mode/corrections.ts       applyCorrections (HIDE)
 *   src/fyd/owner-mode/visibility-policy.ts projectPublicFacts
 *
 * The law: HIDE is a VISIBILITY decision, not a deletion. The fact
 * record (value, identity, provenance linkage) survives intact in the
 * withheld set; only its presence in the public projection changes.
 * The owner EVIDENCE tab can still show it; the public site never sees it.
 */

import {
  applyCorrections,
  assertCorrection,
} from "../../owner-mode/corrections";
import { extractSiteFacts, factIdFor } from "../../owner-mode/facts";
import { demoProvenance } from "../../owner-mode/provenance";
import { projectPublicFacts, hiddenFactIds } from "../../owner-mode/visibility-policy";
import { T0, clearwaterGraph } from "./support";

const TA = "2026-09-23T20:15:00.000Z";
const GBP_HOURS =
  "Mon-Fri 7:00 AM - 6:00 PM; Sat 8:00 AM - 2:00 PM; Emergency service 24/7";

describe("INV-07 owner hide does not delete evidence", () => {
  const graph = clearwaterGraph();
  const facts = extractSiteFacts(graph, T0);
  const gbpHoursFactId = factIdFor("cw-ext-gbp-01", "hours", 0);

  const hide = assertCorrection({
    factRef: { objectId: "cw-ext-gbp-01", field: "hours" },
    op: "HIDE",
    provenance: demoProvenance(null, () => TA),
    sourceValueSeen: GBP_HOURS,
  });

  const applied = applyCorrections(facts, [hide]);
  const proj = projectPublicFacts(applied.facts, [], [hide]);

  test("the hidden fact record survives with value and identity intact", () => {
    const withheld = proj.hiddenFacts.find((f) => f.factId === gbpHoursFactId);
    expect(withheld).toBeDefined();
    expect(withheld).toMatchObject({
      factId: gbpHoursFactId,
      objectId: "cw-ext-gbp-01",
      field: "hours",
      index: 0,
      value: GBP_HOURS,
      kind: "other",
    });
    // The record is the same evidence the extractor observed: nothing
    // was redacted, blanked, or re-keyed by the hide.
    const before = facts.find((f) => f.factId === gbpHoursFactId);
    expect(withheld).toEqual(before);
  });

  test("HIDE changes visibility only: the fact stream keeps the fact", () => {
    const byId = new Map(applied.facts.map((f) => [f.factId, f] as const));
    expect(byId.get(gbpHoursFactId)?.value).toBe(GBP_HOURS);
    expect(applied.facts).toHaveLength(facts.length);
  });

  test("public projection carries no trace of the hidden value", () => {
    expect(
      proj.publicFacts.some((f) => f.factId === gbpHoursFactId),
    ).toBe(false);
    const publicJson = JSON.stringify(proj.publicFacts);
    expect(publicJson).not.toContain("8:00 AM - 2:00 PM");
    // And the public set is otherwise complete: everything the policy
    // does not hide is still there. Location-kind facts stay hidden by
    // the conservative default, independent of this HIDE assertion.
    const expectedHidden = new Set(hiddenFactIds(applied.facts, [], [hide]));
    expect(expectedHidden.has(gbpHoursFactId)).toBe(true);
    expect(proj.publicFacts.length).toBe(facts.length - expectedHidden.size);
    expect(proj.hiddenFacts.length).toBe(expectedHidden.size);
  });

  test("hiding one fact does not disturb any other fact", () => {
    const beforeById = new Map(facts.map((f) => [f.factId, f] as const));
    for (const f of proj.publicFacts) {
      expect(f).toEqual(beforeById.get(f.factId));
    }
  });
});
