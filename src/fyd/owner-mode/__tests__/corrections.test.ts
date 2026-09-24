/**
 * LANE-OWNER tests: owner corrections (CONFIRM / CORRECT / HIDE).
 *
 * Pinned behaviors:
 * - corrections are stored as assertions with provenance
 *   (owner, timestamp, supersedes);
 * - regeneration preserves corrections (assertions replay over fresh facts);
 * - a source change to the same field surfaces a conflict, never a silent
 *   win or loss;
 * - superseded assertions do not apply; only chain heads do;
 * - HIDE feeds the visibility layer as factIds, not as value edits.
 *
 * Run with: npx jest --config src/fyd/owner-mode/jest.config.cjs
 */

import {
  applyCorrections,
  assertCorrection,
  assertionFactId,
  chainHeads,
} from "../corrections";
import { demoProvenance } from "../provenance";
import { extractSiteFacts, factIdFor, type SiteFact } from "../facts";
import type { ObjectGraph } from "../../sitespec/types";
import type { PingObject } from "@/lib/ping/types";

const T0 = "2026-09-23T18:00:00.000Z";
const T1 = "2026-09-23T19:00:00.000Z";
const nowT0 = () => T0;
const nowT1 = () => T1;

function biz(fields: Record<string, string | string[]>): PingObject {
  return {
    id: "biz-1",
    schema: "ping.social.business@1",
    controllerId: "ctrl-1",
    visibility: "public",
    title: "Acme Plumbing",
    description: "",
    fields,
    createdAt: T0,
    updatedAt: T0,
    provenance: { ref: "test" } as unknown as PingObject["provenance"],
  };
}

function graphWith(fields: Record<string, string | string[]>): ObjectGraph {
  return { objects: [biz(fields)], relationships: [] };
}

function factsOf(fields: Record<string, string | string[]>): SiteFact[] {
  return extractSiteFacts(graphWith(fields), T0);
}

describe("assertCorrection", () => {
  it("stores a CORRECT assertion with provenance and a deterministic id", () => {
    const a = assertCorrection({
      factRef: { objectId: "biz-1", field: "phone" },
      op: "CORRECT",
      value: "(970) 555-0199",
      provenance: demoProvenance(null, nowT0),
      sourceValueSeen: "(970) 555-0100",
    });
    expect(a.assertionId).toMatch(/^oa-[0-9a-f]{16}$/);
    expect(a.op).toBe("CORRECT");
    expect(a.value).toBe("(970) 555-0199");
    expect(a.provenance.owner).toBe("demo-owner (seeded, unverified)");
    expect(a.provenance.assertedAt).toBe(T0);
    expect(a.provenance.supersedes).toBeNull();
    expect(a.sourceValueSeen).toBe("(970) 555-0100");
    expect(assertionFactId(a)).toBe(factIdFor("biz-1", "phone", 0));
  });

  it("is deterministic: same inputs, same clock, same assertionId", () => {
    const mk = () =>
      assertCorrection({
        factRef: { objectId: "biz-1", field: "phone" },
        op: "CORRECT",
        value: "(970) 555-0199",
        provenance: demoProvenance(null, nowT0),
        sourceValueSeen: "(970) 555-0100",
      });
    expect(mk().assertionId).toBe(mk().assertionId);
  });

  it("refuses CORRECT without a value and value on CONFIRM/HIDE", () => {
    expect(() =>
      assertCorrection({
        factRef: { objectId: "biz-1", field: "phone" },
        op: "CORRECT",
        provenance: demoProvenance(null, nowT0),
      }),
    ).toThrow(/non-empty corrected value/);
    expect(() =>
      assertCorrection({
        factRef: { objectId: "biz-1", field: "phone" },
        op: "CONFIRM",
        value: "x",
        provenance: demoProvenance(null, nowT0),
      }),
    ).toThrow(/does not take a value/);
  });
});

describe("applyCorrections", () => {
  it("CONFIRM marks the fact confirmed without changing its value", () => {
    const facts = factsOf({ phone: "(970) 555-0100" });
    const a = assertCorrection({
      factRef: { objectId: "biz-1", field: "phone" },
      op: "CONFIRM",
      provenance: demoProvenance(null, nowT0),
      sourceValueSeen: "(970) 555-0100",
    });
    const out = applyCorrections(facts, [a]);
    expect(out.conflicts).toHaveLength(0);
    expect(out.applied).toHaveLength(1);
    expect(out.facts[0].value).toBe("(970) 555-0100");
    expect(out.facts[0].ownerConfirmation).toEqual({
      owner: "demo-owner (seeded, unverified)",
      assertedAt: T0,
    });
    // The input facts are not mutated.
    expect(facts[0].ownerConfirmation).toBeUndefined();
  });

  it("CORRECT replaces the value", () => {
    const facts = factsOf({ phone: "(970) 555-0100" });
    const a = assertCorrection({
      factRef: { objectId: "biz-1", field: "phone" },
      op: "CORRECT",
      value: "(970) 555-0199",
      provenance: demoProvenance(null, nowT0),
      sourceValueSeen: "(970) 555-0100",
    });
    const out = applyCorrections(facts, [a]);
    expect(out.conflicts).toHaveLength(0);
    expect(out.facts[0].value).toBe("(970) 555-0199");
  });

  it("HIDE contributes the factId to hiddenFactIds without editing the fact", () => {
    const facts = factsOf({ facebook: "https://facebook.com/acme" });
    const a = assertCorrection({
      factRef: { objectId: "biz-1", field: "facebook" },
      op: "HIDE",
      provenance: demoProvenance(null, nowT0),
      sourceValueSeen: "https://facebook.com/acme",
    });
    const out = applyCorrections(facts, [a]);
    expect(out.hiddenFactIds).toEqual([factIdFor("biz-1", "facebook", 0)]);
    expect(out.facts[0].value).toBe("https://facebook.com/acme");
  });

  it("preserves corrections across regeneration (fresh facts, same assertions)", () => {
    const v1 = factsOf({ phone: "(970) 555-0100", email: "a@example.com" });
    const a = assertCorrection({
      factRef: { objectId: "biz-1", field: "phone" },
      op: "CORRECT",
      value: "(970) 555-0199",
      provenance: demoProvenance(null, nowT0),
      sourceValueSeen: "(970) 555-0100",
    });
    // Regen: the source changed an UNRELATED field; the phone still says
    // what it said at correction time.
    const v2 = factsOf({ phone: "(970) 555-0100", email: "b@example.com" });
    const out = applyCorrections(v2, [a]);
    expect(out.conflicts).toHaveLength(0);
    const phone = out.facts.find((f) => f.field === "phone")!;
    const email = out.facts.find((f) => f.field === "email")!;
    expect(phone.value).toBe("(970) 555-0199");
    expect(email.value).toBe("b@example.com");
  });

  it("surfaces a conflict when the source changes the corrected field", () => {
    const v1 = factsOf({ phone: "(970) 555-0100" });
    const a = assertCorrection({
      factRef: { objectId: "biz-1", field: "phone" },
      op: "CORRECT",
      value: "(970) 555-0199",
      provenance: demoProvenance(null, nowT0),
      sourceValueSeen: "(970) 555-0100",
    });
    // Regen: the source changed the SAME field to something else.
    const v2 = factsOf({ phone: "(970) 555-0111" });
    expect(v1[0].value).toBe("(970) 555-0100");
    const out = applyCorrections(v2, [a]);
    expect(out.conflicts).toHaveLength(1);
    const c = out.conflicts[0];
    expect(c.sourceValue).toBe("(970) 555-0111");
    expect(c.ownerValue).toBe("(970) 555-0199");
    expect(c.assertionId).toBe(a.assertionId);
    // Neither side wins silently: the owner's value stays applied AND the
    // conflict is surfaced.
    expect(out.facts[0].value).toBe("(970) 555-0199");
  });

  it("no conflict when the source adopts the owner's corrected value", () => {
    const a = assertCorrection({
      factRef: { objectId: "biz-1", field: "phone" },
      op: "CORRECT",
      value: "(970) 555-0199",
      provenance: demoProvenance(null, nowT0),
      sourceValueSeen: "(970) 555-0100",
    });
    const v2 = factsOf({ phone: "(970) 555-0199" });
    const out = applyCorrections(v2, [a]);
    expect(out.conflicts).toHaveLength(0);
    expect(out.facts[0].value).toBe("(970) 555-0199");
  });

  it("surfaces a stale CONFIRM as a conflict without changing the value", () => {
    const a = assertCorrection({
      factRef: { objectId: "biz-1", field: "phone" },
      op: "CONFIRM",
      provenance: demoProvenance(null, nowT0),
      sourceValueSeen: "(970) 555-0100",
    });
    const v2 = factsOf({ phone: "(970) 555-0111" });
    const out = applyCorrections(v2, [a]);
    expect(out.conflicts).toHaveLength(1);
    expect(out.conflicts[0].ownerValue).toBe("(970) 555-0100");
    expect(out.conflicts[0].sourceValue).toBe("(970) 555-0111");
    expect(out.facts[0].value).toBe("(970) 555-0111");
    expect(out.facts[0].ownerConfirmation).toBeUndefined();
  });

  it("only chain heads apply: a superseded assertion loses honestly", () => {
    const facts = factsOf({ phone: "(970) 555-0100" });
    const old = assertCorrection({
      factRef: { objectId: "biz-1", field: "phone" },
      op: "CORRECT",
      value: "(970) 555-0199",
      provenance: demoProvenance(null, nowT0),
      sourceValueSeen: "(970) 555-0100",
    });
    const newer = assertCorrection({
      factRef: { objectId: "biz-1", field: "phone" },
      op: "CORRECT",
      value: "(970) 555-0222",
      provenance: demoProvenance(old.assertionId, nowT1),
      sourceValueSeen: "(970) 555-0100",
    });
    expect(chainHeads([old, newer]).map((a) => a.assertionId)).toEqual([
      newer.assertionId,
    ]);
    const out = applyCorrections(facts, [old, newer]);
    expect(out.applied.map((a) => a.assertionId)).toEqual([newer.assertionId]);
    expect(out.facts[0].value).toBe("(970) 555-0222");
  });

  it("orphans assertions whose fact is gone from the extraction", () => {
    const facts = factsOf({ phone: "(970) 555-0100" });
    const a = assertCorrection({
      factRef: { objectId: "biz-1", field: "myspace" },
      op: "HIDE",
      provenance: demoProvenance(null, nowT0),
    });
    const out = applyCorrections(facts, [a]);
    expect(out.orphaned).toHaveLength(1);
    expect(out.orphaned[0].assertionId).toBe(a.assertionId);
    expect(out.applied).toHaveLength(0);
  });

  it("is deterministic across replays", () => {
    const facts = factsOf({ phone: "(970) 555-0100" });
    const mk = () => [
      assertCorrection({
        factRef: { objectId: "biz-1", field: "phone" },
        op: "CORRECT",
        value: "(970) 555-0199",
        provenance: demoProvenance(null, nowT0),
        sourceValueSeen: "(970) 555-0100",
      }),
    ];
    const d = (o: ReturnType<typeof applyCorrections>) =>
      JSON.stringify({ facts: o.facts, conflicts: o.conflicts });
    expect(d(applyCorrections(facts, mk()))).toBe(
      d(applyCorrections(facts, mk())),
    );
  });
});
