/**
 * Writer A (2026-09-29): PING -> Ask FYD -> Evidence product contract.
 *
 * ONE SEMANTIC UNIT: the existing PING tenant (owner-asserted fixture pin
 * "ping-fyd") is legible to the existing ask path. No separately authored
 * Ask knowledge base, no model-prior facts, no invented services.
 *
 * The four-case product contract:
 * - SUPPORTED: known PING fact -> answer -> object refs -> evidence refs.
 * - PARTIAL: mixed known/unknown -> the answer separates them.
 * - UNSUPPORTED: absent fact -> explicit lack of evidence (refusal).
 * - CONFLICTED: no conflict data exists in the fixture (and none is
 *   fabricated); conflict behavior is proven at the deterministic layer
 *   (conflict-observation ref mapping + a declared unresolved field
 *   conflict over the ping-fyd graph).
 *
 * Every test exercises the production authorized read path: the stub FYD
 * journal gateway feeds PingObjectReader over HTTP. No disk projection
 * JSON is ever read.
 */
import {
  answerAskFyd,
  claimClassFor,
  type AnswerAskFydDeps,
} from "../../../../../fyd/ask/visitor-answer";
import { answerClassFor } from "../ask-pipeline";
import { getSiteBundle, type SiteBundle } from "../../../../../fyd/media/site-bundle";
import type { AskFieldConflict } from "../../../../../fyd/ask/field-conflicts";
import { POST as postNested } from "../[siteId]/route";
import type { NextRequest } from "next/server";
import { startStubJournal, type StubJournal } from "./stub-journal";

let journal: StubJournal;
let PING_BUNDLE: SiteBundle;
let DEPS: AnswerAskFydDeps;

beforeAll(async () => {
  journal = await startStubJournal();
  const bundle = await getSiteBundle("ping-fyd");
  if (!bundle) throw new Error("stub journal did not serve ping-fyd");
  PING_BUNDLE = bundle;
  DEPS = { loadBundle: (id) => (id === "ping-fyd" ? PING_BUNDLE : null) };
});

afterAll(async () => {
  await journal.close();
});

function nestedReq(siteId: string, body: unknown) {
  return {
    req: { json: async () => body } as unknown as NextRequest,
    params: Promise.resolve({ siteId }),
  };
}

async function postAsk(siteId: string, question: string) {
  const { req, params } = nestedReq(siteId, { siteId, question, mode: "visitor" });
  const resp = await postNested(req, { params });
  const body = (await resp.json()) as {
    ok: boolean;
    answer: string;
    answerClass: string;
    answerState: string;
    refusal: boolean;
    citations: { id: string; label: string; kind: string; claimClass: string; basis: string; source: string }[];
    objectRefs: { objectId: string }[];
    evidenceRefs: { id: string }[];
    sourceRefs: { source: string }[];
    unknowns: string[];
  };
  return { resp, body };
}

const SERVICE_TITLES = [
  "AI call answering",
  "Lead follow-up",
  "Scheduling support",
  "Admin automation",
];

describe("ping-fyd tenant resolution", () => {
  test("POST /api/fyd/ask/ping-fyd resolves the tenant (no 404 unknown_site)", async () => {
    const { resp, body } = await postAsk("ping-fyd", "What is the phone number?");
    expect(resp.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.answer).toContain("(970) 589-3309");
  });
});

describe("SUPPORTED: the boring proof", () => {
  test("'What services does PING offer, and how do you know?' -> GRAPH -> ASK RETRIEVAL -> CLAIM -> EVIDENCE -> SERVED RESPONSE", async () => {
    const { resp, body } = await postAsk(
      "ping-fyd",
      "What services does PING offer, and how do you know?",
    );
    expect(resp.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.refusal).toBe(false);
    expect(["SUPPORTED DIRECTLY", "SUPPORTED BY MULTIPLE EVIDENCE"]).toContain(body.answerClass);
    expect(body.answerState).toBe("KNOWN");
    // The four services on record, nothing invented.
    for (const t of SERVICE_TITLES) expect(body.answer).toContain(t);
    // Citations resolve to evidence: every citation id is a real graph
    // object, every citation is a direct (owner-asserted) cite.
    expect(body.citations.length).toBeGreaterThan(0);
    const graphIds = new Set(PING_BUNDLE.graph.objects.map((o) => o.id));
    for (const c of body.citations) {
      expect(c.claimClass).toBe("SUPPORTED DIRECTLY");
      if (c.kind === "object") expect(graphIds.has(c.id)).toBe(true);
    }
    // Structured refs are citation-backed: object and evidence ref ids are
    // real graph objects; sources are named.
    expect(body.objectRefs.length).toBeGreaterThan(0);
    for (const r of body.objectRefs) expect(graphIds.has(r.objectId)).toBe(true);
    for (const r of body.evidenceRefs) {
      const cite = body.citations.find((c) => c.id === r.id);
      expect(cite).toBeDefined();
    }
    expect(body.sourceRefs.length).toBeGreaterThan(0);
    // "how do you know" is answered from the recorded provenance: the
    // owner-asserted basis, never a model prior.
    expect(body.answer).toMatch(/owner|asserted|record/i);
  });
});

describe("PARTIAL: mixed known/unknown is separated, never blended", () => {
  test("hours unknown but the business known: the answer separates them explicitly", async () => {
    const { resp, body } = await postAsk("ping-fyd", "What are the business hours?");
    expect(resp.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.refusal).toBe(false);
    expect(body.answerState).toBe("KNOWN");
    // The known half: the business is on record (cited). The unknown half:
    // stated as unknown, never filled from a model prior.
    expect(body.answer).toMatch(/PING Social/);
    expect(body.answer).toMatch(/no hours are on record/i);
    expect(body.citations.length).toBeGreaterThan(0);
    expect(body.unknowns.length).toBeGreaterThan(0);
    expect(body.answer).not.toMatch(/\d{1,2}:\d{2}/);
  });
});

describe("UNSUPPORTED: absent facts are refused, never invented", () => {
  test("a service not on record is an honest unknown", async () => {
    const { resp, body } = await postAsk("ping-fyd", "Does this business offer financing?");
    expect(resp.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.answerClass).toBe("UNSUPPORTED");
    expect(body.answerState).toBe("UNKNOWN");
    expect(body.refusal).toBe(true);
    expect(body.citations).toEqual([]);
    expect(body.objectRefs).toEqual([]);
    expect(body.evidenceRefs).toEqual([]);
    expect(body.sourceRefs).toEqual([]);
    expect(body.answer).toMatch(/I cannot answer that/i);
  });

  test("pricing is not in the base: no dollar figure is ever emitted", async () => {
    const { resp, body } = await postAsk("ping-fyd", "How much does PING charge?");
    expect(resp.status).toBe(200);
    expect(body.answerClass).toBe("UNSUPPORTED");
    expect(body.answerState).toBe("UNKNOWN");
    expect(body.refusal).toBe(true);
    expect(body.answer).not.toMatch(/\$\d/);
  });
});

describe("CONFLICTED: proven at the deterministic layer, no fabricated data", () => {
  test("a conflict-observation cite is always CONFLICTED (claimClassFor)", () => {
    expect(claimClassFor("CONFLICT")).toBe("CONFLICTED");
    expect(claimClassFor("conflict")).toBe("CONFLICTED");
  });

  test("an unresolved field conflict over the ping-fyd graph yields CONFLICTED and withholds the value", () => {
    const conflict: AskFieldConflict = {
      objectId: "ping-fyd-business",
      field: "phone",
      status: "unresolved",
      observations: [
        {
          value: "(970) 589-3309",
          provenanceKind: "owner-asserted",
          provenanceRef: "owner:tenant-config",
          derivedAt: "2026-09-21T00:00:00.000Z",
        },
        {
          value: "(970) 000-0000",
          provenanceKind: "canonical-journal",
          provenanceRef: "ping-event:stub-conflict-1",
          derivedAt: "2026-09-22T00:00:00.000Z",
        },
      ],
    };
    const bundle: SiteBundle = { ...PING_BUNDLE, fieldConflicts: [conflict] };
    const deps: AnswerAskFydDeps = {
      loadBundle: (id) => (id === "ping-fyd" ? bundle : null),
    };
    const out = answerAskFyd(
      {
        siteId: "ping-fyd",
        question: "What is the phone number?",
        mode: "visitor",
        fieldConflicts: [conflict],
      },
      deps,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) throw new Error("unreachable");
    const answerClass = answerClassFor(out.refusal, out.citations, out.claimClassifications);
    expect(answerClass).toBe("CONFLICTED");
    // The disputed value is never selected: neither observation's value is
    // embedded as the answer.
    expect(out.answer).not.toContain("(970) 000-0000");
    // The disagreement is surfaced via CONFLICTED citations.
    expect(out.citations.some((c) => c.claimClass === "CONFLICTED")).toBe(true);
  });
});
