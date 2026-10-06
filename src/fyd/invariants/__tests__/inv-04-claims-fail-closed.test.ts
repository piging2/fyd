/**
 * INV-04: unbound factual claims fail closed.
 *
 * Machinery under test (real, on the Pig):
 *   src/fyd/ask/concierge.ts answerConciergeQuestion / toAskFydAnswer
 *
 * The law, from the module: every SUPPORTED/DERIVED/INFERRED claim MUST
 * cite evidence; a claim that cannot meet its grade is a bug, not an
 * answer (the module throws rather than render it). UNKNOWN is the
 * honest answer when the graph has no record.
 *
 * This probe asserts the OBSERVABLE contract over a hostile battery
 * (all 7 canonical questions x rich / sparse / conflicting graphs):
 * no emitted answer ever carries a non-UNKNOWN claim without evidence,
 * and pins the throw-guard's presence in the module source.
 */

import * as fs from "fs";
import * as path from "path";
import {
  CONCIERGE_QUESTIONS,
  answerConciergeQuestion,
  toAskFydAnswer,
  type ConciergeInput,
} from "../../ask/concierge";
import { T0, clearwaterGraph, makeObject, objectById } from "./support";

function sparseInput(): ConciergeInput {
  const target = makeObject("sparse-biz", {});
  return {
    siteId: "sparse-site",
    target,
    objects: [target],
    relationships: [],
    question: "",
  };
}

function richInput(question: string): ConciergeInput {
  const g = clearwaterGraph();
  const target = objectById(g, "cw-biz-01");
  return {
    siteId: "clearwater",
    target,
    objects: g.objects,
    relationships: g.relationships,
    question,
  };
}

function conflictingInput(question: string): ConciergeInput {
  const target = makeObject("conflict-biz", {
    phone: ["(970) 555-0104", "(970) 555-0150"],
    description: "We fix pipes.",
  });
  return {
    siteId: "conflict-site",
    target,
    objects: [target],
    relationships: [],
    question,
  };
}

describe("INV-04 unbound factual claims fail closed", () => {
  test("all 7 canonical questions are recognized", () => {
    expect(CONCIERGE_QUESTIONS).toHaveLength(7);
    for (const q of CONCIERGE_QUESTIONS) {
      const ans = answerConciergeQuestion(richInput(q.question));
      expect(ans).not.toBeNull();
      expect(ans?.questionId).toBe(q.id);
    }
  });

  test.each(CONCIERGE_QUESTIONS.map((q) => [q.id, q.question]))(
    "rich graph, question '%s': every non-UNKNOWN claim cites evidence",
    (_id, question) => {
      const ans = answerConciergeQuestion(richInput(question));
      expect(ans).not.toBeNull();
      for (const c of ans!.claims) {
        if (c.grade === "UNKNOWN") {
          expect(c.evidence).toEqual([]);
        } else {
          expect(c.evidence.length).toBeGreaterThan(0);
        }
      }
    },
  );

  test.each(CONCIERGE_QUESTIONS.map((q) => [q.id, q.question]))(
    "sparse graph, question '%s': fail-closed contract holds, unknowns stay UNKNOWN",
    (_id, question) => {
      const input = sparseInput();
      const ans = answerConciergeQuestion({ ...input, question });
      expect(ans).not.toBeNull();
      for (const c of ans!.claims) {
        if (c.grade === "UNKNOWN") {
          expect(c.evidence).toEqual([]);
        } else {
          expect(c.evidence.length).toBeGreaterThan(0);
        }
      }
      // A graph with no records cannot answer "who works here": refused.
      if (_id === "who") expect(ans!.refused).toBe(true);
    },
  );

  test.each(CONCIERGE_QUESTIONS.map((q) => [q.id, q.question]))(
    "conflicting graph, question '%s': no unbound claims rendered",
    (_id, question) => {
      const ans = answerConciergeQuestion(conflictingInput(question));
      expect(ans).not.toBeNull();
      for (const c of ans!.claims) {
        if (c.grade !== "UNKNOWN") {
          expect(c.evidence.length).toBeGreaterThan(0);
        }
      }
    },
  );

  test("AskFyd view: every classification carries its evidence refs", () => {
    for (const q of CONCIERGE_QUESTIONS) {
      const ans = answerConciergeQuestion(richInput(q.question));
      const view = toAskFydAnswer(ans!);
      for (const cc of view.claimClassifications) {
        expect(cc.evidenceRefIds.length).toBeGreaterThan(0);
      }
      // UNKNOWN claims never appear as classifications; they surface as unknowns.
      expect(view.claimClassifications.length).toBe(
        ans!.claims.filter((c) => c.grade !== "UNKNOWN").length,
      );
    }
  });

  test("the throw-guard is pinned in the module (mechanism present)", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "..", "..", "ask", "concierge.ts"),
      "utf8",
    );
    expect(src).toContain("claim without evidence");
    expect(src).toContain("throw new Error");
  });

  test("T0 is pinned (no clock in test inputs)", () => {
    expect(T0).toBe("2026-09-23T19:30:00.000Z");
  });
});
