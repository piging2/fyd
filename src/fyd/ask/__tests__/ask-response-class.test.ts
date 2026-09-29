/**
 * PROD-9: Ask FYD answer-class polarity.
 *
 * (a) denial responses carry responseClass "DENIAL";
 * (b) premise-rejection responses carry "PREMISE_REJECTED" and state the
 *     corrected premise;
 * (c) normal answers carry "ANSWER" and are never misclassified.
 *
 * The classifier is surface-only: it never changes the answer, the
 * 5-class support contract, or the pipeline logic.
 *
 * Run with: npx jest --config src/fyd/ask/jest.config.cjs ask-response-class
 */

import {
  answerAskFyd,
  responseClassFor,
  type AskResponseClass,
} from "../visitor-answer";
import type { SiteBundle } from "../../media/site-bundle";
import { COPPERSMITH_GRAPH } from "../../proceduralize/__fixtures__/coppersmith-graph";
import { generateSiteSpec } from "../../proceduralize/generator";
import type { AskClaimClassification } from "../../../lib/ping/types";

function bundle(): SiteBundle {
  const graph = structuredClone(COPPERSMITH_GRAPH);
  const spec = generateSiteSpec(graph, { generatedAt: "2026-09-24T00:00:00.000Z" });
  return {
    siteId: "coppersmith-plumbing",
    businessName: "Coppersmith Plumbing - HVAC - Mechanical",
    graph,
    spec,
    findings: [],
    renderable: true,
    mediaManifest: null,
  };
}

function ask(question: string) {
  const out = answerAskFyd(
    { siteId: "coppersmith-plumbing", question, mode: "visitor" },
    { loadBundle: (id) => (id === "coppersmith-plumbing" ? bundle() : null) },
  );
  if (!out.ok) throw new Error(`ask failed: ${out.error.kind}: ${out.error.message}`);
  return out;
}

function cc(claim: string, classification: string): AskClaimClassification {
  return { claim, classification, evidenceRefIds: [] };
}

describe("PROD-9 responseClassFor: unit classification", () => {
  test("(a) scope denial -> DENIAL", () => {
    expect(
      responseClassFor({
        refusal: true,
        question: "Who will win the election?",
        answer: "I can only answer questions about Coppersmith Plumbing.",
        claimClassifications: [],
      }),
    ).toBe("DENIAL");
  });

  test("(a) no-evidence denial -> DENIAL, with direct refusal language", () => {
    expect(
      responseClassFor({
        refusal: true,
        question: "Do you offer financing?",
        answer:
          "I cannot answer that: nothing in the site record covers it, and I will not guess.",
        claimClassifications: [],
      }),
    ).toBe("DENIAL");
  });

  test("(a) authority denial -> DENIAL", () => {
    expect(
      responseClassFor({
        refusal: true,
        question: "Reorder the services section",
        answer:
          "Only the controlling identity can change this site. I can draft site changes for the owner, but I cannot draft them for anyone else.",
        claimClassifications: [],
      }),
    ).toBe("DENIAL");
  });

  test("(b) people-branch premise correction -> PREMISE_REJECTED", () => {
    expect(
      responseClassFor({
        refusal: true,
        question: "Who is the owner?",
        answer:
          "The site data contains no person records for Coppersmith Plumbing, so I cannot answer that: there is no owner or staff information on record. I will not guess at names, roles, or personal details that are not on record.",
        claimClassifications: [],
      }),
    ).toBe("PREMISE_REJECTED");
  });

  test("(b) site-patch premise corrections -> PREMISE_REJECTED", () => {
    const cases: [string, string][] = [
      [
        "Reorder the services so Drain Cleaning is first",
        'I could not find a service matching "Drain Cleaning" among this site\'s offerings, so I cannot reorder them.',
      ],
      [
        "Move Plumbing to the top",
        '"Plumbing" is already first, so there is nothing to change.',
      ],
      ["Reorder the services", "The site spec has no sections to reorder."],
    ];
    for (const [question, answer] of cases) {
      expect(responseClassFor({ refusal: true, question, answer, claimClassifications: [] })).toBe(
        "PREMISE_REJECTED",
      );
    }
  });

  test("(b) answered-path premise correction -> PREMISE_REJECTED", () => {
    expect(
      responseClassFor({
        refusal: false,
        question: "What are your emergency hours?",
        answer:
          "No hours are on record for Coppersmith Plumbing.\n\nCoppersmith Plumbing does not offer emergency service: nothing in the site record mentions it.",
        claimClassifications: [
          cc("Coppersmith Plumbing has no hours on record", "DIRECT_FACT"),
          cc("Coppersmith Plumbing does not offer emergency service", "INFERENCE"),
        ],
      }),
    ).toBe("PREMISE_REJECTED");
  });

  test("(c) normal answer with citations -> ANSWER", () => {
    expect(
      responseClassFor({
        refusal: false,
        question: "What services do you offer?",
        answer: "Services on record: Plumbing; Heating & Cooling.",
        claimClassifications: [cc("Coppersmith Plumbing offers Plumbing", "DIRECT_FACT")],
      }),
    ).toBe("ANSWER");
  });

  test("(c) emergency named but no corrected-premise claim -> ANSWER (no misfire)", () => {
    expect(
      responseClassFor({
        refusal: false,
        question: "Do you handle emergency calls?",
        answer: "The site data has no record addressing 'emergency' specifically.",
        claimClassifications: [cc("Coppersmith Plumbing unmatched service topics", "INFERENCE")],
      }),
    ).toBe("ANSWER");
  });

  test("(c) corrected-premise claim but question names no facet -> ANSWER (no misfire)", () => {
    expect(
      responseClassFor({
        refusal: false,
        question: "What are your hours?",
        answer:
          "Coppersmith Plumbing does not offer emergency service: nothing in the site record mentions it.",
        claimClassifications: [
          cc("Coppersmith Plumbing does not offer emergency service", "INFERENCE"),
        ],
      }),
    ).toBe("ANSWER");
  });

  test("responseClass values are exactly the three locked strings", () => {
    const seen = new Set<AskResponseClass>(["ANSWER", "DENIAL", "PREMISE_REJECTED"]);
    expect(seen.size).toBe(3);
  });
});

describe("PROD-9 end to end (answerAskFyd)", () => {
  test("(a) out-of-scope denial carries DENIAL", () => {
    const out = ask("Who will win the election?");
    expect(out.refusal).toBe(true);
    expect(out.responseClass).toBe("DENIAL");
    expect(out.answer).toContain("I can only answer questions about");
  });

  test("(a) ungrounded question carries DENIAL with direct wording", () => {
    const out = ask("Do you offer financing?");
    expect(out.refusal).toBe(true);
    expect(out.responseClass).toBe("DENIAL");
    expect(out.answer).toContain(
      "I cannot answer that: nothing in the site record covers it, and I will not guess.",
    );
  });

  test("(b) emergency-hours question carries PREMISE_REJECTED and states the corrected premise", () => {
    const out = ask("What are your emergency hours?");
    expect(out.refusal).toBe(false);
    expect(out.responseClass).toBe("PREMISE_REJECTED");
    expect(out.answer).toContain("does not offer emergency service");
    expect(out.answer).not.toMatch(/^I (do not|don't) know/i);
  });

  test("(c) normal services answer carries ANSWER", () => {
    const out = ask("What services does Coppersmith offer?");
    expect(out.refusal).toBe(false);
    expect(out.responseClass).toBe("ANSWER");
    expect(out.answer).toContain("Plumbing");
  });

  test("(c) conflicted answers stay ANSWER, never PREMISE_REJECTED", () => {
    // A conflicted answer is a normal answered path: polarity must not
    // steal it into premise-rejection.
    const out = ask("What don't you know?");
    expect(out.refusal).toBe(false);
    expect(out.responseClass).toBe("ANSWER");
  });
});
