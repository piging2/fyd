/**
 * LANE-ASK: minimal evidence-backed Ask FYD concierge.
 *
 * The seven canonical questions, answered ONLY from the site's graph, for
 * the coppersmith-plumbing and happy-place sites. Every claim carries a
 * grade (SUPPORTED / DERIVED / INFERRED / UNKNOWN); no claim is presented
 * as SUPPORTED without cited evidence; UNKNOWN is returned instead of
 * invented facts.
 *
 * The graphs under test are the pinned fixture base graphs the authorized
 * read seam serves (getFydTenantGraph pins these exact digests), with no
 * journal overlays applied: the graph in the test IS the graph the ask
 * lane reads.
 *
 * Run: npx jest --config src/fyd/ask/jest.config.cjs concierge
 */

import { HAPPY_PLACE_GRAPH } from "../../proceduralize/__fixtures__/happy-place-graph";
import { COPPERSMITH_GRAPH } from "../../proceduralize/__fixtures__/coppersmith-graph";
import {
  answerConciergeQuestion,
  CONCIERGE_QUESTIONS,
  matchConciergeQuestion,
  toAskFydAnswer,
  type ConciergeAnswer,
  type ConciergeGrade,
  type ConciergeInput,
} from "../concierge";
import type { ObjectGraph } from "../../sitespec/types";
import type { PingObject } from "../../../lib/ping/types";

const GRADES: ConciergeGrade[] = ["SUPPORTED", "DERIVED", "INFERRED", "UNKNOWN"];

function businessOf(graph: ObjectGraph): PingObject {
  const biz = graph.objects.find(
    (o) => o.schema === "ping.social.business@1" && o.visibility === "public",
  );
  if (!biz) throw new Error("fixture has no public business object");
  return biz;
}

function inputFor(siteId: string, graph: ObjectGraph, question: string): ConciergeInput {
  const target = businessOf(graph);
  return {
    siteId,
    target,
    objects: graph.objects.filter((o) => o.visibility === "public"),
    relationships: graph.relationships,
    question,
  };
}

function answerFor(siteId: string, graph: ObjectGraph, question: string): ConciergeAnswer {
  const ans = answerConciergeQuestion(inputFor(siteId, graph, question));
  if (!ans) throw new Error(`concierge did not match question: ${question}`);
  return ans;
}

/**
 * The grading contract every answer must satisfy:
 * - every claim carries a valid grade;
 * - SUPPORTED / DERIVED / INFERRED claims cite at least one evidence item;
 * - UNKNOWN claims cite nothing (there is nothing to cite) and say so;
 * - every evidence item names label, source, and basis;
 * - the rendered text carries the grade of each claim;
 * - same graph + question gives the same answer (deterministic).
 */
function expectGradingContract(ans: ConciergeAnswer): void {
  expect(ans.claims.length).toBeGreaterThan(0);
  for (const claim of ans.claims) {
    expect(GRADES).toContain(claim.grade);
    expect(ans.text).toContain(`[${claim.grade}]`);
    if (claim.grade === "UNKNOWN") {
      expect(claim.evidence).toHaveLength(0);
      expect(claim.text.toLowerCase()).toContain("unknown");
    } else {
      expect(claim.evidence.length).toBeGreaterThan(0);
      for (const e of claim.evidence) {
        expect(e.label.length).toBeGreaterThan(0);
        expect(e.source.length).toBeGreaterThan(0);
        expect(e.basis.length).toBeGreaterThan(0);
      }
    }
  }
  // Every [n] marker in the text resolves to listed evidence.
  const markers = new Set<number>();
  const re = /\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ans.text)) !== null) markers.add(Number(m[1]));
  for (const n of markers) {
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(ans.evidence.length);
  }
}

function expectDeterministic(siteId: string, graph: ObjectGraph, question: string): void {
  const a = answerFor(siteId, graph, question);
  const b = answerFor(siteId, graph, question);
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  expectGradingContract(a);
}

// ---------------------------------------------------------------------------
// Matcher
// ---------------------------------------------------------------------------

describe("concierge question matching", () => {
  test("the seven canonical questions match their ids", () => {
    for (const { id, question } of CONCIERGE_QUESTIONS) {
      expect(matchConciergeQuestion(question)).toBe(id);
    }
  });

  test("case and punctuation do not matter", () => {
    expect(matchConciergeQuestion("HOW DO YOU KNOW?")).toBe("provenance");
    expect(matchConciergeQuestion("  who works here ")).toBe("who");
    expect(matchConciergeQuestion("What information conflicts?!")).toBe("conflicts");
  });

  test("non-concierge questions return null (existing composer keeps them)", () => {
    expect(matchConciergeQuestion("")).toBeNull();
    expect(matchConciergeQuestion("What is the meaning of life?")).toBeNull();
    expect(matchConciergeQuestion("Draft a reply to this post: thanks!")).toBeNull();
    expect(matchConciergeQuestion("Propose updating the phone to 555-1234")).toBeNull();
  });

  test("what-does-this-business-do is profile, not services", () => {
    expect(matchConciergeQuestion("What does this business do?")).toBe("profile");
    expect(matchConciergeQuestion("What services do they offer?")).toBe("services");
  });
});

// ---------------------------------------------------------------------------
// happy-place: website-business-6fa5ebd99d72c4cb
// ---------------------------------------------------------------------------

describe("concierge: happy-place", () => {
  const siteId = "happy-place";

  test("What does this business do?", () => {
    const ans = answerFor(siteId, HAPPY_PLACE_GRAPH, "What does this business do?");
    expectDeterministic(siteId, HAPPY_PLACE_GRAPH, "What does this business do?");
    expect(ans.questionId).toBe("profile");
    expect(ans.text).toContain("Happy Place Carpentry LLC");
    expect(ans.text).toContain("Licensed Oregon carpentry contractor (CCB# 254240)");
    expect(ans.claims.some((c) => c.grade === "SUPPORTED")).toBe(true);
    // No invented detail beyond the record: the answer quotes, it does not elaborate.
    expect(ans.text).not.toContain("Taylor");
  });

  test("What services do they offer?", () => {
    const ans = answerFor(siteId, HAPPY_PLACE_GRAPH, "What services do they offer?");
    expectDeterministic(siteId, HAPPY_PLACE_GRAPH, "What services do they offer?");
    expect(ans.questionId).toBe("services");
    for (const svc of ["Repairs", "Fencing", "Painting", "Drywall", "Restoration"]) {
      expect(ans.text).toContain(svc);
    }
    const supported = ans.claims.filter((c) => c.grade === "SUPPORTED");
    expect(supported).toHaveLength(5);
    // The count claim is derived from the service evidence, and cites it.
    const derived = ans.claims.filter((c) => c.grade === "DERIVED");
    expect(derived).toHaveLength(1);
    expect(derived[0].text).toContain("5 services");
    expect(derived[0].evidence.length).toBeGreaterThanOrEqual(5);
  });

  test("Where do they operate?", () => {
    const ans = answerFor(siteId, HAPPY_PLACE_GRAPH, "Where do they operate?");
    expectDeterministic(siteId, HAPPY_PLACE_GRAPH, "Where do they operate?");
    expect(ans.questionId).toBe("where");
    expect(ans.text).toContain("Adair Village, OR, US");
    expect(ans.text).toContain("Benton, Linn, Marion, and Polk Counties, Oregon");
    expect(ans.claims.every((c) => c.grade === "SUPPORTED")).toBe(true);
  });

  test("Who works here? -> UNKNOWN, nothing invented", () => {
    const ans = answerFor(siteId, HAPPY_PLACE_GRAPH, "Who works here?");
    expectDeterministic(siteId, HAPPY_PLACE_GRAPH, "Who works here?");
    expect(ans.questionId).toBe("who");
    expect(ans.claims.some((c) => c.grade === "UNKNOWN")).toBe(true);
    expect(ans.claims.every((c) => c.grade === "UNKNOWN")).toBe(true);
    expect(ans.text).toContain("[UNKNOWN]");
    // The contact email names taylor@...; that must never become a person.
    expect(ans.text).not.toMatch(/taylor/i);
    expect(ans.refused).toBe(true);
  });

  test("How do you know? -> the evidence chain", () => {
    const ans = answerFor(siteId, HAPPY_PLACE_GRAPH, "How do you know?");
    expectDeterministic(siteId, HAPPY_PLACE_GRAPH, "How do you know?");
    expect(ans.questionId).toBe("provenance");
    expect(ans.text).toContain("https://happy-place-platform.vercel.app/");
    expect(ans.text).toContain("2026-09-21");
    expect(ans.evidence.length).toBeGreaterThan(0);
    for (const e of ans.evidence) {
      expect(e.basis).toContain("website statement");
    }
  });

  test("What information conflicts? -> none found", () => {
    const ans = answerFor(siteId, HAPPY_PLACE_GRAPH, "What information conflicts?");
    expectDeterministic(siteId, HAPPY_PLACE_GRAPH, "What information conflicts?");
    expect(ans.questionId).toBe("conflicts");
    expect(ans.conflicts).toHaveLength(0);
    expect(ans.text).toContain("No conflicting information found");
    expect(ans.claims.some((c) => c.grade === "DERIVED")).toBe(true);
  });

  test("What don't you know? -> asked-about facts with no evidence", () => {
    const ans = answerFor(siteId, HAPPY_PLACE_GRAPH, "What don't you know?");
    expectDeterministic(siteId, HAPPY_PLACE_GRAPH, "What don't you know?");
    expect(ans.questionId).toBe("unknowns");
    expect(ans.unknowns).toContain("Who works here (names and roles)");
    expect(ans.unknowns).toContain("Business hours");
    expect(ans.unknowns).toContain("The owner's identity");
    // Known facts are not listed as unknown.
    expect(ans.unknowns).not.toContain("The services this business offers");
    expect(ans.unknowns).not.toContain("Where this business operates");
    expect(ans.unknowns).not.toContain("How to contact this business");
    expect(ans.claims.every((c) => c.grade === "UNKNOWN")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// coppersmith-plumbing: website-business-2f1327c09d622175
// ---------------------------------------------------------------------------

describe("concierge: coppersmith-plumbing", () => {
  const siteId = "coppersmith-plumbing";

  test("What does this business do?", () => {
    const ans = answerFor(siteId, COPPERSMITH_GRAPH, "What does this business do?");
    expectDeterministic(siteId, COPPERSMITH_GRAPH, "What does this business do?");
    expect(ans.questionId).toBe("profile");
    expect(ans.text).toContain("Coppersmith Plumbing - HVAC - Mechanical");
    expect(ans.text).toContain("serviced Western Colorado for over 25 years");
    expect(ans.claims.some((c) => c.grade === "SUPPORTED")).toBe(true);
    // The fixture description is truncated mid-sentence; the concierge
    // quotes it verbatim and never completes it.
    expect(ans.text).not.toContain("our team of");
  });

  test("What services do they offer?", () => {
    const ans = answerFor(siteId, COPPERSMITH_GRAPH, "What services do they offer?");
    expectDeterministic(siteId, COPPERSMITH_GRAPH, "What services do they offer?");
    expect(ans.questionId).toBe("services");
    for (const svc of ["Plumbing", "Heating & Cooling", "HVAC", "Ventilation"]) {
      expect(ans.text).toContain(svc);
    }
    expect(ans.claims.filter((c) => c.grade === "SUPPORTED")).toHaveLength(4);
    const derived = ans.claims.filter((c) => c.grade === "DERIVED");
    expect(derived).toHaveLength(1);
    expect(derived[0].text).toContain("4 services");
  });

  test("Where do they operate?", () => {
    const ans = answerFor(siteId, COPPERSMITH_GRAPH, "Where do they operate?");
    expectDeterministic(siteId, COPPERSMITH_GRAPH, "Where do they operate?");
    expect(ans.questionId).toBe("where");
    expect(ans.text).toContain("Grand Junction, Colorado, 81501, United States");
    expect(ans.claims.every((c) => c.grade === "SUPPORTED")).toBe(true);
  });

  test("Who works here? -> person record cited, name honestly unknown", () => {
    const ans = answerFor(siteId, COPPERSMITH_GRAPH, "Who works here?");
    expectDeterministic(siteId, COPPERSMITH_GRAPH, "Who works here?");
    expect(ans.questionId).toBe("who");
    expect(ans.text).toContain("coppersmithplm");
    // The person record exists and is cited...
    expect(ans.claims.some((c) => c.grade === "SUPPORTED")).toBe(true);
    // ...the username reading is labeled as inference...
    const inferred = ans.claims.filter((c) => c.grade === "INFERRED");
    expect(inferred).toHaveLength(1);
    expect(inferred[0].evidence.length).toBeGreaterThan(0);
    // ...and the real name is honestly unknown.
    expect(ans.claims.some((c) => c.grade === "UNKNOWN")).toBe(true);
  });

  test("How do you know? -> the evidence chain", () => {
    const ans = answerFor(siteId, COPPERSMITH_GRAPH, "How do you know?");
    expectDeterministic(siteId, COPPERSMITH_GRAPH, "How do you know?");
    expect(ans.questionId).toBe("provenance");
    expect(ans.text).toContain("https://www.coppersmithplumbing.com/");
    expect(ans.text).toContain("2026-09-21");
    expect(ans.evidence.length).toBeGreaterThan(0);
  });

  test("What information conflicts? -> none found", () => {
    const ans = answerFor(siteId, COPPERSMITH_GRAPH, "What information conflicts?");
    expectDeterministic(siteId, COPPERSMITH_GRAPH, "What information conflicts?");
    expect(ans.questionId).toBe("conflicts");
    expect(ans.conflicts).toHaveLength(0);
    expect(ans.text).toContain("No conflicting information found");
  });

  test("What don't you know? -> asked-about facts with no evidence", () => {
    const ans = answerFor(siteId, COPPERSMITH_GRAPH, "What don't you know?");
    expectDeterministic(siteId, COPPERSMITH_GRAPH, "What don't you know?");
    expect(ans.questionId).toBe("unknowns");
    expect(ans.unknowns).toContain("Pricing");
    expect(ans.unknowns).toContain("The owner's identity");
    // Known facts are not listed as unknown.
    expect(ans.unknowns).not.toContain("The services this business offers");
    expect(ans.unknowns).not.toContain("Where this business operates");
    expect(ans.unknowns).not.toContain("How to contact this business");
    expect(ans.unknowns).not.toContain("Business hours");
  });
});

// ---------------------------------------------------------------------------
// Sparse-evidence fixture: UNKNOWN is returned, never invented.
// ---------------------------------------------------------------------------

function sparseGraph(): ObjectGraph {
  const biz: PingObject = {
    id: "sparse-biz",
    schema: "ping.social.business@1",
    controllerId: "identity_test",
    visibility: "public",
    title: "Sparse Test Business",
    description: "",
    fields: {},
    createdAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T00:00:00.000Z",
    provenance: {
      kind: "website-derived",
      ref: "website-ingestion:https://example.com/",
      derivedAt: "2026-09-21T13:50:00Z",
    },
  };
  return { objects: [biz], relationships: [] };
}

describe("concierge: sparse evidence", () => {
  test("who works here -> UNKNOWN, no invented people", () => {
    const ans = answerFor("sparse-site", sparseGraph(), "Who works here?");
    expectGradingContract(ans);
    expect(ans.claims.every((c) => c.grade === "UNKNOWN")).toBe(true);
    expect(ans.refused).toBe(true);
    expect(ans.text).toContain("[UNKNOWN]");
  });

  test("services -> UNKNOWN, no invented service list", () => {
    const ans = answerFor("sparse-site", sparseGraph(), "What services do they offer?");
    expectGradingContract(ans);
    expect(ans.claims.every((c) => c.grade === "UNKNOWN")).toBe(true);
    expect(ans.refused).toBe(true);
    for (const invented of ["Plumbing", "Repairs", "Decks", "HVAC"]) {
      expect(ans.text).not.toContain(invented);
    }
  });

  test("where -> UNKNOWN", () => {
    const ans = answerFor("sparse-site", sparseGraph(), "Where do they operate?");
    expectGradingContract(ans);
    expect(ans.claims.every((c) => c.grade === "UNKNOWN")).toBe(true);
  });

  test("how do you know -> still cites the record it has", () => {
    const ans = answerFor("sparse-site", sparseGraph(), "How do you know?");
    expectGradingContract(ans);
    expect(ans.claims.some((c) => c.grade === "SUPPORTED")).toBe(true);
    expect(ans.text).toContain("https://example.com/");
    expect(ans.refused).toBe(false);
  });

  test("what don't you know -> every probe is unknown", () => {
    const ans = answerFor("sparse-site", sparseGraph(), "What don't you know?");
    expectGradingContract(ans);
    expect(ans.unknowns).toContain("Who works here (names and roles)");
    expect(ans.unknowns).toContain("The services this business offers");
    expect(ans.unknowns).toContain("Where this business operates");
    expect(ans.unknowns).toContain("How to contact this business");
    expect(ans.unknowns).toContain("Business hours");
    expect(ans.unknowns).toContain("Pricing");
    expect(ans.unknowns).toContain("The owner's identity");
  });

  test("conflicts on sparse data -> none found, still graded", () => {
    const ans = answerFor("sparse-site", sparseGraph(), "What information conflicts?");
    expectGradingContract(ans);
    expect(ans.conflicts).toHaveLength(0);
    expect(ans.text).toContain("No conflicting information found");
  });
});

// ---------------------------------------------------------------------------
// Conflict fixture: contradictory evidence is surfaced, both sides cited.
// ---------------------------------------------------------------------------

function conflictGraph(): ObjectGraph {
  const biz: PingObject = {
    id: "conflict-biz",
    schema: "ping.social.business@1",
    controllerId: "identity_test",
    visibility: "public",
    title: "Conflict Test Co",
    description: "A business with two different locations on record.",
    fields: {},
    createdAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T00:00:00.000Z",
    provenance: {
      kind: "website-derived",
      ref: "website-ingestion:https://example.com/",
      derivedAt: "2026-09-21T13:50:00Z",
    },
  };
  const locA: PingObject = {
    id: "conflict-loc-a",
    schema: "ping.social.location@1",
    controllerId: "identity_test",
    visibility: "public",
    title: "Springfield, IL",
    description: "",
    fields: { locality: "Springfield, IL" },
    createdAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T00:00:00.000Z",
    provenance: {
      kind: "website-derived",
      ref: "website-ingestion:https://example.com/",
      derivedAt: "2026-09-21T13:50:00Z",
    },
  };
  const locB: PingObject = {
    id: "conflict-loc-b",
    schema: "ping.social.location@1",
    controllerId: "identity_test",
    visibility: "public",
    title: "Shelbyville, IL",
    description: "",
    fields: { locality: "Shelbyville, IL" },
    createdAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T00:00:00.000Z",
    provenance: {
      kind: "website-derived",
      ref: "website-ingestion:https://example.com/",
      derivedAt: "2026-09-21T13:50:00Z",
    },
  };
  return {
    objects: [biz, locA, locB],
    relationships: [
      {
        id: "rel-conflict-a",
        subject: "conflict-biz",
        predicate: "located_at",
        object: "conflict-loc-a",
        status: "active",
        createdAt: "2026-09-21T00:00:00.000Z",
        evidenceRef: "test",
      },
      {
        id: "rel-conflict-b",
        subject: "conflict-biz",
        predicate: "located_at",
        object: "conflict-loc-b",
        status: "active",
        createdAt: "2026-09-21T00:00:00.000Z",
        evidenceRef: "test",
      },
    ],
  };
}

describe("concierge: conflicts", () => {
  test("two different locations are surfaced as a conflict, both cited", () => {
    const ans = answerFor("conflict-site", conflictGraph(), "What information conflicts?");
    expectGradingContract(ans);
    expect(ans.conflicts).toHaveLength(1);
    expect(ans.conflicts[0].fact).toBe("location");
    const values = ans.conflicts[0].values.map((v) => v.value).sort();
    expect(values).toEqual(["Shelbyville, IL", "Springfield, IL"]);
    // Both sides are SUPPORTED (each cites its own evidence)...
    expect(ans.claims.filter((c) => c.grade === "SUPPORTED").length).toBeGreaterThanOrEqual(2);
    // ...and the contradiction itself is DERIVED from the two values.
    const derived = ans.claims.filter((c) => c.grade === "DERIVED");
    expect(derived.length).toBeGreaterThanOrEqual(1);
    expect(derived[0].text).toContain("contradict");
    expect(derived[0].evidence.length).toBeGreaterThanOrEqual(2);
    expect(ans.text).toContain("Springfield, IL");
    expect(ans.text).toContain("Shelbyville, IL");
  });
});

// ---------------------------------------------------------------------------
// Wiring view: conversion onto the existing AskAnswer-shaped pieces.
// ---------------------------------------------------------------------------

describe("concierge: toAskFydAnswer wiring view", () => {
  test("services answer converts with aligned [n] markers and citations", () => {
    const ans = answerFor("happy-place", HAPPY_PLACE_GRAPH, "What services do they offer?");
    const view = toAskFydAnswer(ans);
    expect(view.evidenceRefs).toHaveLength(ans.evidence.length);
    // Every classification cites real evidence refs.
    for (const c of view.claimClassifications) {
      expect(c.evidenceRefIds.length).toBeGreaterThan(0);
      for (const id of c.evidenceRefIds) {
        expect(view.evidenceRefs.some((r) => r.id === id)).toBe(true);
      }
    }
    // DERIVED claims are labeled as derived; SUPPORTED service claims are
    // website statements (the site's own words), never invented facts.
    const classes = new Set(view.claimClassifications.map((c) => c.classification));
    expect(classes.has("DERIVED_FACT")).toBe(true);
    expect(classes.has("website_statement")).toBe(true);
  });

  test("UNKNOWN claims become unknowns, never citations", () => {
    const ans = answerFor("happy-place", HAPPY_PLACE_GRAPH, "Who works here?");
    const view = toAskFydAnswer(ans);
    expect(view.evidenceRefs).toHaveLength(0);
    expect(view.claimClassifications).toHaveLength(0);
    expect(view.unknowns.length).toBeGreaterThan(0);
    expect(view.unknowns.some((u) => u.includes("Who works here"))).toBe(true);
  });

  test("no SUPPORTED claim without cited evidence, across all 14 site/question pairs", () => {
    for (const graph of [HAPPY_PLACE_GRAPH, COPPERSMITH_GRAPH]) {
      const siteId = graph === HAPPY_PLACE_GRAPH ? "happy-place" : "coppersmith-plumbing";
      for (const { question } of CONCIERGE_QUESTIONS) {
        const view = toAskFydAnswer(answerFor(siteId, graph, question));
        for (const c of view.claimClassifications) {
          expect(c.evidenceRefIds.length).toBeGreaterThan(0);
          expect(c.claim.length).toBeGreaterThan(0);
        }
      }
    }
  });
});
