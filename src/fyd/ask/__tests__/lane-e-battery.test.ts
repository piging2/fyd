/**
 * LANE E scratch battery: Ask FYD question battery on COPPERSMITH, now
 * with assertions (not console-only) plus the locked FYD-Q1 (fail-closed
 * conflict handling) and FYD-Q2 (zero-disclosure HIDE) scenarios.
 *
 * Runs the real server pipeline (answerAskFyd -> composeAskFyd ->
 * composeAnswer) against the real fixture graph + a generated spec, with a
 * synthetic bundle (no journal, no network).
 *
 * Scratch only: /home/nolan/worktrees/lane-e-ask (pure HEAD e474c89b).
 * Run with: npx jest --config src/fyd/ask/jest.config.cjs lane-e-battery
 */

import { answerAskFyd, type AnswerAskFydInput } from "../visitor-answer";
import type { SiteBundle } from "../../media/site-bundle";
import { COPPERSMITH_GRAPH } from "../../proceduralize/__fixtures__/coppersmith-graph";
import { generateSiteSpec } from "../../proceduralize/generator";
import type { AskFieldConflict } from "../field-conflicts";
import type { FieldVisibilityDecision } from "../sitespec/field-visibility";

const BIZ = "website-business-2f1327c09d622175";
const LOC = "website-business-2f1327c09d622175-location";
const PHONE_A = "970-245-3869";
const PHONE_B = "970-555-0142";

function bundle(overrides?: Partial<SiteBundle>): SiteBundle {
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
    ...overrides,
  };
}

function ask(question: string, input?: Partial<AnswerAskFydInput>, b?: SiteBundle) {
  const bb = b ?? bundle();
  const out = answerAskFyd(
    { siteId: "coppersmith-plumbing", question, mode: "visitor", ...input },
    { loadBundle: (id) => (id === "coppersmith-plumbing" ? bb : null) },
  );
  if (!out.ok) throw new Error(`ask failed: ${out.error.kind}: ${out.error.message}`);
  return out;
}

describe("LANE E battery (coppersmith-plumbing)", () => {
  test("Q1 services: general question answered from service records", () => {
    const out = ask("What services does Coppersmith offer?");
    expect(out.refusal).toBe(false);
    expect(out.answer).toContain("Plumbing");
    expect(out.answer).toContain("Heating & Cooling");
    // One evidence marker per listed offering (claim-to-evidence binding).
    const markers = (out.answer.match(/\[\d+\]/g) ?? []).length;
    expect(markers).toBeGreaterThanOrEqual(4);
    // The business name is an identity word, never an UNKNOWN topic.
    expect(out.unknowns).not.toContain("coppersmith");
  });

  test("Q2 emergency: explicit UNKNOWN, never inferred from plumbing", () => {
    const out = ask("Do they handle emergency plumbing?");
    expect(out.answer).toContain("No emergency service is on record");
    expect(out.answer).not.toMatch(/emergency plumbing (is|are) offered/i);
    expect(out.unknowns).toContain("emergency");
  });

  test("Q3 location: recorded location with traceable citation", () => {
    const out = ask("Where do they work?");
    expect(out.answer).toContain("Grand Junction");
    expect(out.citations.length).toBeGreaterThan(0);
    expect(out.citations[0].source).toContain("coppersmithplumbing.com");
  });

  test("Q4 contact: website and phone from the business record", () => {
    const out = ask("How can I contact them?");
    expect(out.answer).toContain(PHONE_A);
    expect(out.answer).toContain("https://coppersmithplumbing.com");
  });

  test("Q5 profile: structured summary, no invented facts", () => {
    const out = ask("What do you know about this business?");
    expect(out.refusal).toBe(false);
    expect(out.answer).toContain("Plumbing");
    expect(out.citations.length).toBeGreaterThan(0);
  });

  test("Q6 provenance: identity, source, date, basis", () => {
    const out = ask("How do you know?");
    expect(out.answer).toContain("coppersmithplumbing.com");
    expect(out.answer).toContain("2026-09-21");
  });

  test("Q7 coverage: evidence-bound limitations, not a refusal", () => {
    const out = ask("What don't you know?");
    expect(out.refusal).toBe(false);
    expect(out.answer).toContain("Not on record");
    expect(out.answer).not.toContain("I consulted");
    expect(out.unknowns).toContain("emergency service");
    expect(out.unknowns).toContain("pricing");
  });

  test("negative control: ungrounded service topic still refuses", () => {
    const out = ask("Do you offer financing?");
    expect(out.refusal).toBe(true);
  });
});

describe("FYD-Q1: fail-closed conflict handling", () => {
  const phoneConflict: AskFieldConflict = {
    objectId: BIZ,
    field: "phone",
    status: "unresolved",
    observations: [
      {
        value: PHONE_A,
        provenanceKind: "website-ingestion",
        provenanceRef: "website-ingestion:https://www.coppersmithplumbing.com/",
        derivedAt: "2026-09-21T13:50:00Z",
      },
      {
        value: PHONE_B,
        provenanceKind: "canonical-journal",
        provenanceRef: "canonical-journal:evt-0001",
        derivedAt: "2026-09-24T10:00:00Z",
      },
    ],
  };

  test("conflicted phone: locked copy, both values suppressed", () => {
    const out = ask("How can I contact them?", { fieldConflicts: [phoneConflict] });
    // Locked public copy, verbatim.
    expect(out.answer).toContain("Contact information is being verified.");
    // Neither disputed value is ever selected.
    expect(out.answer).not.toContain(PHONE_A);
    expect(out.answer).not.toContain(PHONE_B);
    // Internal evidence mechanics never surface.
    expect(out.answer).not.toContain("requested verification");
    // Uncontested contact facts still answer.
    expect(out.answer).toContain("https://coppersmithplumbing.com");
  });

  test("conflicted phone: both evidence chains survive in citations", () => {
    const out = ask("How can I contact them?", { fieldConflicts: [phoneConflict] });
    const obs0 = out.citations.find((c) => c.id.endsWith("#conflict-0"));
    const obs1 = out.citations.find((c) => c.id.endsWith("#conflict-1"));
    expect(obs0).toBeDefined();
    expect(obs1).toBeDefined();
    expect(obs0!.source).toContain("coppersmithplumbing.com");
    expect(obs1!.source).toContain("canonical journal");
    // The disputed values are withheld even in the evidence surface.
    for (const c of out.citations) {
      expect(c.label).not.toContain(PHONE_A);
      expect(c.label).not.toContain(PHONE_B);
    }
  });

  test("conflicted address: locked copy, value suppressed", () => {
    const addressConflict: AskFieldConflict = {
      objectId: BIZ,
      field: "locality",
      status: "unresolved",
      observations: [
        {
          value: "Grand Junction, Colorado, 81501, United States",
          provenanceKind: "website-ingestion",
          provenanceRef: "website-ingestion:https://www.coppersmithplumbing.com/",
          derivedAt: "2026-09-21T13:50:00Z",
        },
        {
          value: "Fruita, Colorado, United States",
          provenanceKind: "canonical-journal",
          provenanceRef: "canonical-journal:evt-0002",
          derivedAt: "2026-09-24T10:00:00Z",
        },
      ],
    };
    const out = ask("Where do they work?", { fieldConflicts: [addressConflict] });
    expect(out.answer).toContain("Contact information is being verified.");
    expect(out.answer).not.toContain("Grand Junction");
    expect(out.answer).not.toContain("Fruita");
  });

  test("resolved conflict is inert: the graph value answers", () => {
    const out = ask("How can I contact them?", {
      fieldConflicts: [{ ...phoneConflict, status: "resolved" }],
    });
    expect(out.answer).toContain(PHONE_A);
    expect(out.answer).not.toContain("being verified");
  });

  test("coverage names a conflicted field as being verified, not absent", () => {
    const out = ask("What don't you know?", { fieldConflicts: [phoneConflict] });
    expect(out.answer).toContain("Contact information is being verified.");
    expect(out.unknowns).not.toContain("phone");
  });
});

describe("FYD-Q2: zero-disclosure HIDE", () => {
  const hideAddress: FieldVisibilityDecision = {
    objectId: BIZ,
    field: "address",
    policy: "hide",
    decidedBy: "owner",
    decidedAt: "2026-09-24T15:00:00.000Z",
    source: "owner_override",
    version: 1,
  };

  test("hidden address: zero disclosure through every traversal", () => {
    const out = ask("Where do they work?", { fieldVisibilityDecisions: [hideAddress] });
    expect(out.answer).toContain("No public location is on record");
    // The value appears nowhere: not the answer, not citation labels,
    // not unknowns.
    const haystack = [
      out.answer,
      ...out.citations.map((c) => `${c.label} ${c.source}`),
      ...out.unknowns,
    ].join("\n");
    expect(haystack).not.toContain("Grand Junction");
    expect(haystack).not.toContain("81501");
  });

  test("hidden address: profile answer keeps no location sentence", () => {
    const out = ask("What do you know about this business?", {
      fieldVisibilityDecisions: [hideAddress],
    });
    expect(out.answer).not.toContain("Grand Junction");
    expect(out.answer).not.toContain("81501");
    expect(out.answer).not.toMatch(/listed at|Location on record/i);
  });

  test("hidden address: location object is unreachable (unknown_object)", () => {
    const out = answerAskFyd(
      {
        siteId: "coppersmith-plumbing",
        question: "What is this?",
        mode: "visitor",
        objectId: LOC,
        fieldVisibilityDecisions: [hideAddress],
      },
      { loadBundle: (id) => (id === "coppersmith-plumbing" ? bundle() : null) },
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe("unknown_object");
  });

  test("hidden address: owner-authorized source graph is untouched", () => {
    const b = bundle();
    ask("Where do they work?", { fieldVisibilityDecisions: [hideAddress] }, b);
    const biz = b.graph.objects.find((o) => o.id === BIZ);
    expect(biz?.fields["locality"]).toContain("Grand Junction");
    expect(b.graph.objects.some((o) => o.id === LOC)).toBe(true);
    expect(
      b.graph.relationships.some((r) => r.predicate === "located_at" && r.status === "active"),
    ).toBe(true);
  });

  test("HIDE on a non-address field does not cut the location traversal", () => {
    const hidePhone: FieldVisibilityDecision = { ...hideAddress, field: "phone" };
    const out = ask("Where do they work?", { fieldVisibilityDecisions: [hidePhone] });
    expect(out.answer).toContain("Grand Junction");
    const contact = ask("How can I contact them?", { fieldVisibilityDecisions: [hidePhone] });
    expect(contact.answer).not.toContain(PHONE_A);
    expect(contact.answer).toContain("https://coppersmithplumbing.com");
  });
});

describe("Q-F-06: tangential people questions are never labeled supported", () => {
  // Regression for FL-20260924-201 (live :3101): "What is the owner's
  // favorite food?" was answered "Person on record: coppersmithplm. [11]"
  // with answerClass "supported". The people branch treated any question
  // containing "owner" as a people question and cited a person record for
  // a question it does not answer.
  test("favorite food: refusal with the unmatched topics as unknowns", () => {
    const out = ask("What is the owner's favorite food?");
    expect(out.refusal).toBe(true);
    expect(out.citations).toHaveLength(0);
    expect(out.unknowns).toContain("favorite");
    expect(out.unknowns).toContain("food");
    expect(out.answer).not.toContain("Person on record");
    // Route-level reduction (answerClassFor) maps refusal / zero citations
    // to "unknown": no citation can carry claimClass "supported".
    expect(out.citations.every((c) => c.claimClass !== "supported")).toBe(true);
  });

  test.each([
    "What is the owner's blood type?",
    "What is the owner's favorite color?",
    "When is the owner's birthday?",
    "What does the owner like to eat?",
    "Is the owner married?",
    "Is the owner linked to any charities?",
  ])("tangential %p is never supported", (question) => {
    const out = ask(question);
    expect(out.refusal).toBe(true);
    expect(out.citations).toHaveLength(0);
    expect(out.citations.every((c) => c.claimClass !== "supported")).toBe(true);
  });

  test("legitimate people questions still answer from the person record", () => {
    for (const question of [
      "Who owns this business?",
      "Who works here?",
      "Who owns Coppersmith Plumbing?",
      "What is the owner's name?",
    ]) {
      const out = ask(question);
      expect(out.refusal).toBe(false);
      expect(out.answer).toContain("coppersmithplm");
      expect(out.citations.length).toBeGreaterThan(0);
    }
  });
});
