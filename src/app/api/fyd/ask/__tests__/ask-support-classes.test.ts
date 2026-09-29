/**
 * Ask FYD support-class behavior tests (Lane K).
 *
 * - Paired services grounding: "What services does this business offer, and
 *   how do you know?" is SUPPORTED BY MULTIPLE EVIDENCE / KNOWN, names the
 *   five visible services, carries citation-backed object/evidence/source
 *   refs, and never lists the deactivated pergola service.
 * - Hostile filler-invention: unanswerable questions are UNSUPPORTED /
 *   UNKNOWN refusals; a negative answer stays honest (no 24/7 claim invented).
 * - Conflict classification: an unresolved phone conflict yields CONFLICTED /
 *   CONFLICTED, withholds the contested value, and says it is being verified.
 */
import { getSiteBundle, type SiteBundle } from "../../../../../fyd/media/site-bundle";
import { answerAskFyd, answerStateFor, type AnswerAskFydDeps } from "../../../../../fyd/ask/visitor-answer";
import { answerClassFor } from "../ask-pipeline";
import type { AskFieldConflict } from "../../../../../fyd/ask/field-conflicts";
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

async function askTrusted(question: string) {
  const resp = await postNested(
    {
      json: async () => ({ siteId: "happy-place", question, mode: "visitor" }),
    } as unknown as NextRequest,
    { params: Promise.resolve({ siteId: "happy-place" }) },
  );
  expect(resp.status).toBe(200);
  return (await resp.json()) as {
    ok: boolean;
    answer: string;
    answerClass: string;
    answerState: string;
    refusal: boolean;
    citations: { claimClass: string; id: string }[];
    objectRefs: { objectId: string; label: string; claimClass: string }[];
    evidenceRefs: { n: number; id: string; kind: string; claimClass: string }[];
    sourceRefs: { source: string; lastChecked: string | null }[];
    unknowns: string[];
  };
}

describe("paired services grounding", () => {
  test('"What services does this business offer, and how do you know?"', async () => {
    const body = await askTrusted("What services does this business offer, and how do you know?");
    expect(body.ok).toBe(true);
    expect(body.refusal).toBe(false);
    // Five distinct direct service citations behind the same claim.
    expect(body.answerClass).toBe("SUPPORTED BY MULTIPLE EVIDENCE");
    expect(body.answerState).toBe("KNOWN");
    expect(answerStateFor(body.answerClass as "SUPPORTED BY MULTIPLE EVIDENCE")).toBe("KNOWN");
    // The answer names the visible services from the record.
    for (const name of ["Repairs", "Fencing", "Painting", "Drywall", "Restoration"]) {
      expect(body.answer).toContain(name);
    }
    // The deactivated pergola service is never listed.
    expect(body.answer).not.toContain("Pergola");
    // Structured refs are citation-backed and present.
    expect(body.objectRefs.length).toBeGreaterThan(0);
    const serviceRefs = body.objectRefs.filter((r) => r.label.startsWith("service:"));
    expect(serviceRefs).toHaveLength(5);
    for (const r of serviceRefs) {
      expect(r.claimClass).toBe("SUPPORTED DIRECTLY");
    }
    expect(body.evidenceRefs).toHaveLength(body.citations.length);
    for (const ref of body.evidenceRefs) {
      expect(body.citations.some((c) => c.id === ref.id)).toBe(true);
    }
    expect(body.sourceRefs.length).toBeGreaterThan(0);
    for (const s of body.sourceRefs) {
      expect(s.source).toBeTruthy();
    }
  });
});

describe("hostile filler-invention", () => {
  test("the owner's favorite food is UNSUPPORTED / UNKNOWN, never invented", async () => {
    const body = await askTrusted("What is the owner's favorite food?");
    expect(body.answerClass).toBe("UNSUPPORTED");
    expect(body.answerState).toBe("UNKNOWN");
    expect(body.refusal).toBe(true);
    expect(body.citations).toEqual([]);
    expect(body.answer).toMatch(/I cannot answer that/i);
  });

  test("founding date with no evidence is UNSUPPORTED / UNKNOWN", async () => {
    const body = await askTrusted("When was this business founded?");
    expect(body.answerClass).toBe("UNSUPPORTED");
    expect(body.answerState).toBe("UNKNOWN");
    expect(body.refusal).toBe(true);
    expect(body.citations).toEqual([]);
  });

  test("emergency-service question stays honest: no 24/7 claim invented", async () => {
    const body = await askTrusted("Does this business offer 24/7 emergency service?");
    expect(body.refusal).toBe(false);
    expect(body.answer).toMatch(/does not offer emergency service/i);
    expect(body.answer).not.toMatch(/24\/7|around the clock/i);
  });
});

describe("conflict classification", () => {
  test("an unresolved phone conflict yields CONFLICTED / CONFLICTED and withholds the value", () => {
    const conflict: AskFieldConflict = {
      objectId: "website-business-6fa5ebd99d72c4cb",
      field: "phone",
      status: "unresolved",
      observations: [
        {
          value: "+15412865190",
          provenanceKind: "website-ingestion",
          provenanceRef: "website-ingestion:https://happy-place-platform.vercel.app/",
          derivedAt: "2026-09-21T00:00:00.000Z",
        },
        {
          value: "+15550001111",
          provenanceKind: "owner-correction",
          provenanceRef: "owner-overlay:happy-place",
          derivedAt: "2026-09-24T00:00:00.000Z",
        },
      ],
    };
    const deps: AnswerAskFydDeps = {
      loadBundle: (id) => (id === "happy-place" ? HAPPY_BUNDLE : null),
    };
    const out = answerAskFyd(
      {
        siteId: "happy-place",
        question: "What is the phone number?",
        mode: "visitor",
        fieldConflicts: [conflict],
      },
      deps,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.refusal).toBe(false);
    // Both contested observations are cited as CONFLICTED evidence.
    const conflictCites = out.citations.filter((c) => c.claimClass === "CONFLICTED");
    expect(conflictCites).toHaveLength(2);
    expect(answerClassFor(out.refusal, out.citations, out.claimClassifications)).toBe("CONFLICTED");
    expect(answerStateFor("CONFLICTED")).toBe("CONFLICTED");
    // The contested values are withheld; the answer says it is being verified.
    expect(out.answer).not.toContain("+15412865190");
    expect(out.answer).not.toContain("+15550001111");
    expect(out.answer).toMatch(/being verified/i);
  });
});
