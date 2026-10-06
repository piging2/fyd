/**
 * INV-09: conflicting evidence -> no silent invention.
 *
 * Machinery under test (real, on the Pig):
 *   src/fyd/ask/concierge.ts answerConciergeQuestion ("conflicts" question)
 *
 * The law: when the site data says two things, the answer surfaces BOTH
 * values with their evidence and labels the contradiction. It never
 * merges, averages, or picks one silently. UNKNOWN is for no evidence;
 * conflict is for contradictory evidence; invention is never an option.
 */

import { answerConciergeQuestion } from "../../ask/concierge";
import { makeObject } from "./support";

const PHONE_A = "(970) 555-0104";
const PHONE_B = "(970) 555-0150";

function conflictingTarget() {
  return makeObject("conflict-biz", {
    phone: [PHONE_A, PHONE_B],
    description: "We fix pipes.",
  });
}

describe("INV-09 conflicting evidence -> no silent invention", () => {
  const target = conflictingTarget();
  const ans = answerConciergeQuestion({
    siteId: "conflict-site",
    target,
    objects: [target],
    relationships: [],
    question: "What information conflicts?",
  });

  test("the question is answered, not refused", () => {
    expect(ans).not.toBeNull();
    expect(ans!.questionId).toBe("conflicts");
    expect(ans!.refused).toBe(false);
  });

  test("both conflicting values are surfaced as SUPPORTED claims with evidence", () => {
    const texts = ans!.claims.map((c) => c.text);
    expect(texts.some((t) => t.includes(PHONE_A))).toBe(true);
    expect(texts.some((t) => t.includes(PHONE_B))).toBe(true);
    for (const c of ans!.claims.filter(
      (c) => c.text.includes(PHONE_A) || c.text.includes(PHONE_B),
    )) {
      expect(c.grade).toBe("SUPPORTED");
      expect(c.evidence.length).toBeGreaterThan(0);
    }
  });

  test("the contradiction is labeled, not silently resolved", () => {
    const conflict = ans!.conflicts.find((c) => c.fact === "phone");
    expect(conflict).toBeDefined();
    expect(conflict!.values.map((v) => v.value).sort()).toEqual(
      [PHONE_A, PHONE_B].sort(),
    );
    const derived = ans!.claims.find((c) => c.grade === "DERIVED");
    expect(derived).toBeDefined();
    expect(derived!.text).toMatch(/contradict/i);
  });

  test("no invented third value appears anywhere in the answer", () => {
    const phoneLike = ans!.text.match(
      /\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g,
    ) ?? [];
    const known = new Set([PHONE_A, PHONE_B]);
    for (const p of phoneLike) {
      expect(known.has(p)).toBe(true);
    }
    // The answer never claims a single resolved phone.
    expect(ans!.text).not.toMatch(/correct phone is/i);
    expect(ans!.text).not.toMatch(/resolved to/i);
  });
});
