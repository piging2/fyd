/**
 * Ask FYD question-relevance tests (2026-10-03 relevance fix).
 *
 * Live regression (dpl_8eTZEWJdAxyjSdhwNuZDmwrr2D87, SHA 843ef791):
 * cited evidence must actually address the question's claims before any
 * SUPPORTED label is assigned. Three failure modes were served live:
 *
 * 1. "Who is the CEO and what did they have for breakfast?" -> the
 *    profile branch fired on the "who"/"they" anchor alone and dumped the
 *    business description as a SUPPORTED DIRECTLY / KNOWN answer to a
 *    question about a CEO and breakfast.
 * 2. "What is the business owners favorite color and their dogs name?" ->
 *    same profile-branch misfire via the "business" anchor.
 * 3. "Do you offer roof replacement, plumbing repairs, and electrical
 *    panel upgrades?" -> one generic word ("repairs") grounded the whole
 *    services listing; the body honestly said no record addresses the
 *    named topics, but the envelope claimed SUPPORTED BY MULTIPLE
 *    EVIDENCE / KNOWN.
 *
 * The fix: the profile branch and the services branch only fire when the
 * question's named topics are grounded in the facets they answer from;
 * otherwise the topics join unknowns and the question falls through to
 * the honest refusal. Envelope/body consistency then follows
 * mechanically: no cited claim the question does not address, so no
 * SUPPORTED label.
 *
 * Run with: npx jest --config src/fyd/ask/jest.config.cjs ask-relevance
 */
import { getSiteBundle, type SiteBundle } from "../../../../../fyd/media/site-bundle";
import { POST as postNested } from "../[siteId]/route";
import type { NextRequest } from "next/server";
import { startStubJournal, type StubJournal } from "./stub-journal";

let journal: StubJournal;
let HAPPY_BUNDLE: SiteBundle;

beforeAll(async () => {
  journal = await startStubJournal();
  const happy = await getSiteBundle("happy-place");
  if (!happy) throw new Error("stub journal did not serve happy-place");
  HAPPY_BUNDLE = happy;
});
afterAll(async () => {
  await journal.close();
});

interface AskBody {
  ok: boolean;
  answer: string;
  answerClass: string;
  answerState: string;
  responseClass: string;
  refusal: boolean;
  citations: { n: number; claimClass: string; id: string }[];
  claims: { claim: string; claimClass: string; evidenceRefIds: string[] }[];
  evidenceRefs: { n: number; id: string; kind: string; claimClass: string }[];
  unknowns: string[];
}

async function askTrusted(question: string): Promise<AskBody> {
  const resp = await postNested(
    {
      json: async () => ({ siteId: "happy-place", question, mode: "visitor" }),
    } as unknown as NextRequest,
    { params: Promise.resolve({ siteId: "happy-place" }) },
  );
  expect(resp.status).toBe(200);
  return (await resp.json()) as AskBody;
}

/** The honest-refusal shape: UNSUPPORTED / UNKNOWN, no citations, no [n] markers. */
function expectHonestRefusal(body: AskBody): void {
  expect(body.ok).toBe(true);
  expect(body.answerClass).toBe("UNSUPPORTED");
  expect(body.answerState).toBe("UNKNOWN");
  expect(body.refusal).toBe(true);
  expect(body.citations).toEqual([]);
  expect(body.evidenceRefs).toEqual([]);
  expect(body.answer).toMatch(/I cannot answer that/i);
  expect(body.answer).not.toMatch(/\[\d+\]/);
}

describe("live-regression queries refuse honestly", () => {
  test("CEO/breakfast: the profile dump is not an answer about a CEO", async () => {
    const body = await askTrusted("Who is the CEO and what did they have for breakfast?");
    expectHonestRefusal(body);
    // The named topics are reported as unknown, never answered around.
    expect(body.unknowns).toContain("ceo");
    expect(body.unknowns).toContain("breakfast");
    expect(body.responseClass).toBe("DENIAL");
  });

  test("owner favorite color / dog name: no profile blurb for personal details", async () => {
    const body = await askTrusted(
      "What is the business owners favorite color and their dogs name?",
    );
    expectHonestRefusal(body);
    expect(body.unknowns).toContain("favorite");
    expect(body.unknowns).toContain("color");
    expect(body.unknowns).toContain("dogs");
  });

  test("roof/plumbing/electrical: one generic word must not ground a listing", async () => {
    const body = await askTrusted(
      "Do you offer roof replacement, plumbing repairs, and electrical panel upgrades?",
    );
    expectHonestRefusal(body);
    for (const topic of ["roof", "plumbing", "electrical", "panel", "upgrades"]) {
      expect(body.unknowns).toContain(topic);
    }
  });

  test("Microsoft affiliation refusal keeps passing", async () => {
    const body = await askTrusted(
      "Is Happy Place Carpentry affiliated with Microsoft or headquartered in Redmond Washington?",
    );
    expectHonestRefusal(body);
    expect(body.responseClass).toBe("DENIAL");
  });
});

describe("adversarial variants", () => {
  test("different personal-life question refuses", async () => {
    const body = await askTrusted("What is the owner's favorite movie?");
    expectHonestRefusal(body);
    expect(body.unknowns).toContain("movie");
  });

  test("service not offered refuses", async () => {
    // Loose-"do" routing (pre-existing, intentional): a "Do you ...?"
    // question without strong services triggers refuses without naming
    // unknowns. The refusal and the honest body are what matter here.
    const body = await askTrusted("Do you install swimming pools?");
    expectHonestRefusal(body);
  });

  test("partially grounded services question refuses instead of mislabeling", async () => {
    // "repairs" is on record (Repairs); "saunas" is not. The record
    // cannot address the question's claims as asked, so the answer must
    // not carry a SUPPORTED label for it.
    const body = await askTrusted("Do you offer repairs and saunas?");
    expectHonestRefusal(body);
    expect(body.unknowns).toContain("saunas");
  });
});

describe("genuinely supported questions keep working", () => {
  test("general services question still lists from the record", async () => {
    const body = await askTrusted("What services do you offer?");
    expect(body.ok).toBe(true);
    expect(body.refusal).toBe(false);
    expect(body.answerClass).toBe("SUPPORTED BY MULTIPLE EVIDENCE");
    expect(body.answerState).toBe("KNOWN");
    expect(body.citations.length).toBeGreaterThan(0);
    for (const name of ["Repairs", "Fencing", "Painting", "Drywall", "Restoration"]) {
      expect(body.answer).toContain(name);
    }
    // Per-claim verdicts: every served claim names its support class and
    // evidence refs, and every evidence ref id resolves to a served ref.
    expect(body.claims.length).toBeGreaterThan(0);
    const servedIds = new Set(body.evidenceRefs.map((r) => r.id));
    for (const claim of body.claims) {
      expect(claim.claim.trim().length).toBeGreaterThan(0);
      expect(["SUPPORTED DIRECTLY", "DERIVED", "CONFLICTED"]).toContain(claim.claimClass);
      for (const refId of claim.evidenceRefIds) {
        expect(servedIds.has(refId)).toBe(true);
      }
    }
  });

  test("fully grounded specific service question still answers", async () => {
    const body = await askTrusted("Do you offer fencing?");
    expect(body.ok).toBe(true);
    expect(body.refusal).toBe(false);
    expect(body.answerState).toBe("KNOWN");
    expect(body.citations.length).toBeGreaterThan(0);
    expect(body.answer).toContain("Fencing");
  });

  test("profile question still answers from the business record", async () => {
    const body = await askTrusted("What is this business?");
    expect(body.ok).toBe(true);
    expect(body.refusal).toBe(false);
    expect(body.answerClass).toBe("SUPPORTED DIRECTLY");
    expect(body.answerState).toBe("KNOWN");
    expect(body.citations.length).toBeGreaterThan(0);
  });

  test("named-business profile question still answers", async () => {
    const body = await askTrusted("Tell me about Happy Place Carpentry");
    expect(body.ok).toBe(true);
    expect(body.refusal).toBe(false);
    expect(body.answerState).toBe("KNOWN");
    expect(body.citations.length).toBeGreaterThan(0);
  });

  test("hours question still answers", async () => {
    const body = await askTrusted("What are your hours?");
    expect(body.ok).toBe(true);
    expect(body.refusal).toBe(false);
    expect(body.answerState).toBe("KNOWN");
    expect(body.citations.length).toBeGreaterThan(0);
  });

  test("location question still answers", async () => {
    const body = await askTrusted("Where are you located?");
    expect(body.ok).toBe(true);
    expect(body.refusal).toBe(false);
    expect(body.answerState).toBe("KNOWN");
    expect(body.citations.length).toBeGreaterThan(0);
  });

  test("contact question still answers", async () => {
    const body = await askTrusted("How can I contact them?");
    expect(body.ok).toBe(true);
    expect(body.refusal).toBe(false);
    expect(body.answerState).toBe("KNOWN");
    expect(body.citations.length).toBeGreaterThan(0);
  });
});
