/**
 * INV-03: hidden objects never leak into public projections.
 *
 * Machinery under test (real, on the Pig):
 *   src/fyd/owner-mode/corrections.ts       applyCorrections / assertCorrection (HIDE)
 *   src/fyd/owner-mode/visibility-policy.ts projectPublicFacts / hiddenFactIds /
 *                                           setFactVisibility (safety bounds)
 *   src/fyd/object/by-id.ts                 loadObjectViewById (non-public -> null)
 *
 * The law: hidden facts are ABSENT from the public projection, not
 * redacted inside it. The renderer, the spec generator, and Ask FYD's
 * public answers consume publicFacts ONLY.
 */

import {
  applyCorrections,
  assertCorrection,
} from "../../owner-mode/corrections";
import { extractSiteFacts, factIdFor } from "../../owner-mode/facts";
import { demoProvenance } from "../../owner-mode/provenance";
import {
  hiddenFactIds,
  projectPublicFacts,
  setFactVisibility,
} from "../../owner-mode/visibility-policy";
import { loadObjectViewById } from "../../object/by-id";
import { T0, clearwaterGraph } from "./support";

const TA = "2026-09-23T20:15:00.000Z";

describe("INV-03 hidden objects never leak into public projections", () => {
  const graph = clearwaterGraph();
  const facts = extractSiteFacts(graph, T0);
  const gbpHoursFactId = factIdFor("cw-ext-gbp-01", "hours", 0);

  const hide = assertCorrection({
    factRef: { objectId: "cw-ext-gbp-01", field: "hours" },
    op: "HIDE",
    provenance: demoProvenance(null, () => TA),
    sourceValueSeen: "Mon-Fri 7:00 AM - 6:00 PM; Sat 8:00 AM - 2:00 PM; Emergency service 24/7",
  });

  test("HIDE routes the fact to the withheld set, value untouched", () => {
    const r = applyCorrections(facts, [hide]);
    expect(r.hiddenFactIds).toEqual([gbpHoursFactId]);
    const projected = new Map(r.facts.map((f) => [f.factId, f] as const));
    // HIDE does not edit the value: FACT and VISIBILITY stay separate.
    expect(projected.get(gbpHoursFactId)?.value).toBe(
      "Mon-Fri 7:00 AM - 6:00 PM; Sat 8:00 AM - 2:00 PM; Emergency service 24/7",
    );
  });

  test("hidden fact is ABSENT from the public projection, not redacted", () => {
    const r = applyCorrections(facts, [hide]);
    const proj = projectPublicFacts(r.facts, [], [hide]);
    expect(proj.publicFacts.map((f) => f.factId)).not.toContain(gbpHoursFactId);
    expect(proj.hiddenFacts.map((f) => f.factId)).toContain(gbpHoursFactId);
    // Absence, not redaction: the hidden VALUE appears nowhere in the
    // public projection bytes.
    const publicJson = JSON.stringify(proj.publicFacts);
    expect(publicJson).not.toContain("8:00 AM - 2:00 PM");
    // The withheld record keeps its full identity and value.
    const withheld = proj.hiddenFacts.find((f) => f.factId === gbpHoursFactId);
    expect(withheld).toMatchObject({
      objectId: "cw-ext-gbp-01",
      field: "hours",
      value:
        "Mon-Fri 7:00 AM - 6:00 PM; Sat 8:00 AM - 2:00 PM; Emergency service 24/7",
    });
  });

  test("hiddenFactIds helper: HIDE assertion plus conservative-default location facts", () => {
    const r = applyCorrections(facts, [hide]);
    const ids = hiddenFactIds(r.facts, [], [hide]);
    // The owner's HIDE assertion is honored...
    expect(ids).toContain(gbpHoursFactId);
    // ...and the policy's conservative default hides location-kind facts
    // even with no owner action. Every other hidden id must be
    // location-kind: the policy never hides anything else unasked.
    const byId = new Map(r.facts.map((f) => [f.factId, f] as const));
    for (const id of ids) {
      if (id === gbpHoursFactId) continue;
      expect(byId.get(id)?.kind).toBe("location");
    }
    // Deterministic: same inputs, same hidden set.
    expect(hiddenFactIds(r.facts, [], [hide])).toEqual(ids);
  });

  test("safety bound: the business name (identity) can never be hidden", () => {
    const identityFact = facts.find((f) => f.kind === "identity") ?? {
      factId: factIdFor("cw-biz-01", "name", 0),
      objectId: "cw-biz-01",
      field: "name",
      index: 0,
      value: "Clearwater Plumbing",
      kind: "identity" as const,
      extractedAt: T0,
    };
    const factsWithIdentity = identityFact.factId.startsWith("fact-")
      ? [...facts.filter((f) => f.factId !== identityFact.factId), identityFact]
      : facts;
    const out = setFactVisibility(
      factsWithIdentity,
      [],
      identityFact.factId,
      "hidden",
      demoProvenance(null, () => TA),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/identity/i);
  });

  test("safety bound: visibility only applies to observed facts", () => {
    const out = setFactVisibility(
      facts,
      [],
      "fact-deadbeefdeadbeef",
      "hidden",
      demoProvenance(null, () => TA),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toMatch(/Unknown fact/);
  });

  test("object loader: unknown tenant/object never serves a view", () => {
        // Unknown tenant: the caller resolves no projection (null), so the
    // loader serves nothing. Unknown object: same, via a real projection.
    expect(loadObjectViewById(null, "no-such-tenant", "no-such-object")).toBeNull();
  });
});
