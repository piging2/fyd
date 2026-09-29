/**
 * Visitor Ask FYD pipeline tests (fyd/ask-fyd-visitor lane).
 *
 * - Known question: answered from evidence, with citations.
 * - Unknown question: refused, never invented.
 * - Non-public object: never cited and never quoted, via a synthetic bundle
 *   injected through the loader seam.
 * - The widget module compiles under strict TS (import check).
 */
import { answerAskFyd, type AnswerAskFydDeps } from "../../../../../fyd/ask/visitor-answer";
import { getSiteBundle, type SiteBundle } from "../../../../../fyd/media/site-bundle";
import { AskFydWidget } from "../../../../../fyd/components/ask-fyd-widget";
import type { PingObject } from "../../../../../lib/ping/types";
import { POST as postNested } from "../[siteId]/route";
import type { NextRequest } from "next/server";
import { startStubJournal, type StubJournal } from "./stub-journal";

/**
 * Every test in this file exercises the production authorized read path:
 * the stub FYD journal gateway feeds PingObjectReader over HTTP. No disk
 * projection JSON is ever read (see the sentinel test in
 * src/fyd/ask/__tests__/graph-read-route.test.ts).
 */
let journal: StubJournal;
/** Pre-resolved bundles; answerAskFyd's loader seam stays sync. */
let HAPPY_BUNDLE: SiteBundle;
let COPPER_BUNDLE: SiteBundle;
let DEPS: AnswerAskFydDeps;

beforeAll(async () => {
  journal = await startStubJournal();
  const happy = await getSiteBundle("happy-place");
  const copper = await getSiteBundle("coppersmith-plumbing");
  if (!happy || !copper) throw new Error("stub journal did not serve the tenants");
  HAPPY_BUNDLE = happy;
  COPPER_BUNDLE = copper;
  const byId = new Map([
    ["happy-place", HAPPY_BUNDLE],
    ["coppersmith-plumbing", COPPER_BUNDLE],
  ]);
  DEPS = { loadBundle: (id) => byId.get(id) ?? null };
});

afterAll(async () => {
  await journal.close();
});

/**
 * POST a JSON body to the trusted-path ask route. The legacy flat route no
 * longer serves (Q-P0-06 Mission M), so serving behavior is covered here
 * through POST /api/fyd/ask/[siteId]. The route only ever calls
 * request.json().
 */
async function postAsk(body: unknown) {
  const record =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const siteId = typeof record.siteId === "string" ? record.siteId : "happy-place";
  const req = { json: async () => body } as unknown as NextRequest;
  return postNested(req, { params: Promise.resolve({ siteId }) });
}

describe("answerAskFyd", () => {
  test("unknown site id fails closed", () => {
    const out = answerAskFyd(
      { siteId: "no-such-site", question: "What is the phone number?", mode: "visitor" },
      DEPS,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe("unknown_site");
  });

  test("empty question is rejected", () => {
    const out = answerAskFyd({ siteId: "happy-place", question: "   ", mode: "visitor" }, DEPS);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe("bad_question");
  });

  test("known question is answered from evidence with citations", () => {
    const out = answerAskFyd(
      { siteId: "happy-place", question: "What is the phone number?", mode: "visitor" },
      DEPS,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.refusal).toBe(false);
    expect(out.answer).toContain("+15412865190");
    expect(out.answer).toContain("[1]");
    expect(out.citations.length).toBeGreaterThan(0);
    expect(out.citations[0].label).toContain("Happy Place Carpentry LLC");
    expect(out.citations[0].source).toContain("happy-place-platform.vercel.app");
    expect(out.citations[0].basis.length).toBeGreaterThan(0);
  });

  test("unknown question is refused, never invented", () => {
    const out = answerAskFyd(
      {
        siteId: "happy-place",
        question: "Does this business offer financing?",
        mode: "visitor",
      },
      DEPS,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.refusal).toBe(true);
    expect(out.citations).toEqual([]);
    expect(out.answer).toMatch(/I cannot answer that/i);
  });

  test("site-change requests from a visitor are refused, not drafted", () => {
    const out = answerAskFyd(
      {
        siteId: "happy-place",
        question: "Put carpentry first on the homepage",
        mode: "visitor",
      },
      DEPS,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.refusal).toBe(true);
    expect(out.citations).toEqual([]);
    expect(out.answer).toMatch(/only the controlling identity/i);
  });

  test("non-public objects are never cited or quoted", () => {
    const secret: PingObject = {
      id: "website-business-secret-notes",
      schema: "ping.social.business@1",
      controllerId: "identity_fyd_compiler_test",
      visibility: "private",
      title: "Secret Internal Notes",
      description: "Owner-only notes that must never reach visitors.",
      fields: {
        internal_note: "SECRET-MARGIN-XYZ the owner plans to double prices quietly",
      },
      createdAt: "2026-09-20T00:00:00.000Z",
      updatedAt: "2026-09-20T00:00:00.000Z",
      provenance: {
        kind: "website-derived",
        ref: "website-ingestion:https://example.invalid/",
        derivedAt: "2026-09-20T00:00:00.000Z",
      },
    };
    const real = HAPPY_BUNDLE;
    expect(real).not.toBeNull();
    const bundle: SiteBundle = {
      ...(real as SiteBundle),
      graph: {
        objects: [...(real as SiteBundle).graph.objects, secret],
        relationships: (real as SiteBundle).graph.relationships,
      },
    };
    const deps: AnswerAskFydDeps = {
      loadBundle: (id) => (id === "happy-place-test" ? bundle : null),
    };
    for (const question of [
      "What does the internal note say?",
      "What are the secret expansion plans?",
      "Tell me about the secret internal notes",
    ]) {
      const out = answerAskFyd({ siteId: "happy-place-test", question, mode: "visitor" }, deps);
      expect(out.ok).toBe(true);
      if (!out.ok) continue;
      expect(out.answer).not.toContain("SECRET-MARGIN-XYZ");
      expect(
        out.citations.every((c) => !c.label.includes("Secret Internal Notes")),
      ).toBe(true);
    }
  });

  test("coppersmith bundle answers from its own evidence", () => {
    const out = answerAskFyd(
      {
        siteId: "coppersmith-plumbing",
        question: "What is this business?",
        mode: "visitor",
      },
      DEPS,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.refusal).toBe(false);
    expect(out.answer).toContain("Coppersmith Plumbing");
  });

  test("owner-corrected phone is cited as owner field evidence, not a website statement", () => {
    const real = HAPPY_BUNDLE;
    expect(real).not.toBeNull();
    const objects = (real as SiteBundle).graph.objects.map((o) =>
      o.schema === "ping.social.business@1"
        ? {
            ...o,
            // In production the owner overlay applies the correction to
            // fields; the test mirrors the composed (overlay-applied) graph.
            fields: { ...o.fields, phone: "+15415550123" },
            ownerFieldCorrections: [
              {
                field: "phone" as const,
                label: "Phone",
                sourceValue: "+15412865190",
                ownerValue: "+15415550123",
                correctedAt: "2026-09-21T12:00:00.000Z",
                actorLabel: "Demo Owner (seeded, unverified)",
                basis: "owner correction (demo owner mode)",
                sourceDrifted: false,
              },
            ],
          }
        : o,
    );
    const bundle: SiteBundle = {
      ...(real as SiteBundle),
      graph: { objects, relationships: (real as SiteBundle).graph.relationships },
    };
    const deps: AnswerAskFydDeps = {
      loadBundle: (id) => (id === "happy-place-test" ? bundle : null),
    };
    const out = answerAskFyd(
      { siteId: "happy-place-test", question: "What is the phone number?", mode: "visitor" },
      deps,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.refusal).toBe(false);
    // The answer states the owner's value and names the site's value.
    expect(out.answer).toContain("+15415550123");
    expect(out.answer).toContain("+15412865190");
    // The phone sentence cites a field-level owner-correction ref.
    const phoneCite = out.citations.find((c) => c.id.endsWith("#phone"));
    expect(phoneCite).toBeDefined();
    expect(phoneCite?.source).toBe("Owner correction");
    expect(phoneCite?.basis).toBe("Owner-set value");
    // Uncorrected fields still cite the website as a website statement.
    const objCite = out.citations.find((c) => c.id === "website-business-6fa5ebd99d72c4cb");
    expect(objCite?.basis).toContain("website statement");
  });
});

describe("journal overlays compose through the HTTP read path", () => {
  test("deactivated demo service exists but is private; set_field applied", () => {
    // If the reader failed to parse the journal row shape, these overlays
    // would be silently dropped and the pergola object would be absent.
    const pergola = HAPPY_BUNDLE.graph.objects.find(
      (o) => o.id === "website-service-51de038c1defe8bd",
    );
    expect(pergola).toBeDefined();
    expect(pergola!.visibility).toBe("private");
    expect(pergola!.provenance.kind).toBe("canonical-journal");
    expect(pergola!.provenance.ref).toBe("ping-event:stub-ev-001");
    const biz = HAPPY_BUNDLE.graph.objects.find(
      (o) => o.id === "website-business-6fa5ebd99d72c4cb",
    );
    expect(biz!.fields.tagline).toBe("Built right. Built to last.");
    expect(biz!.provenance.updatedRefs).toContain("ping-event:stub-ev-007");
  });
});

describe("AskFydWidget", () => {
  test("widget module loads (strict compile check)", () => {
    expect(typeof AskFydWidget).toBe("function");
  });
});
describe("journal read failure (FL: Ask FYD error mapping)", () => {
  // The suite's other tests prove the authorized journal read path works;
  // these prove a failed read is the same honest unknown: never an answer,
  // never a leak of internal detail.

  test("answerAskFyd maps a throwing loader to projection_unavailable, never throws", () => {
    const deps: AnswerAskFydDeps = {
      loadBundle: () => {
        throw new Error("simulated authorized-read failure");
      },
    };
    const out = answerAskFyd(
      { siteId: "happy-place", question: "What is the phone number?", mode: "visitor" },
      deps,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.kind).toBe("projection_unavailable");
      expect(out.error.message).toMatch(/unknown/i);
    }
  });

  test("POST returns structured 503 when the journal read fails", async () => {
    const saved = process.env.FYD_JOURNAL_GATEWAY_URL;
    // Nothing listens here: the governed reader fails closed.
    process.env.FYD_JOURNAL_GATEWAY_URL = "http://127.0.0.1:1";
    try {
      const resp = await postAsk({
        siteId: "happy-place",
        question: "What is the phone number?",
        mode: "visitor",
      });
      expect(resp.status).toBe(503);
      const body = (await resp.json()) as Record<string, unknown>;
      expect(body.ok).toBe(false);
      expect(body.kind).toBe("projection_unavailable");
      expect(body.answerUnknown).toBe(true);
      expect(typeof body.error).toBe("string");
      expect(body.error as string).toMatch(/unknown/i);
      expect(body.attempted).toMatch(/projection/i);
      // Internal detail never leaks to the visitor.
      expect(body.error as string).not.toContain("127.0.0.1");
      expect(body.error as string).not.toContain("/home/");
    } finally {
      if (saved === undefined) delete process.env.FYD_JOURNAL_GATEWAY_URL;
      else process.env.FYD_JOURNAL_GATEWAY_URL = saved;
    }
  });

  test("recovery: POST answers normally again once the journal is reachable", async () => {
    const resp = await postAsk({
      siteId: "happy-place",
      question: "What is the phone number?",
      mode: "visitor",
    });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.refusal).toBe(false);
    expect(body.answer as string).toContain("+15412865190");
  });
});

describe("200 response carries the honest ask fields (FL: unknowns / actions / proposal)", () => {
  test("unknowns, suggestedActions, and proposal are present and never invented", async () => {
    const resp = await postAsk({
      siteId: "happy-place",
      question: "Does this business offer financing?",
      mode: "visitor",
    });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    // A refused question carries the unknowns array (possibly empty),
    // reports refusal honestly, and invents no actions or proposals.
    expect(Array.isArray(body.unknowns)).toBe(true);
    expect(body.refusal).toBe(true);
    expect(body.suggestedActions).toEqual([]);
    expect(body.proposal).toBeNull();
  });

  test("answered question carries the same fields with empty unknowns", async () => {
    const resp = await postAsk({
      siteId: "happy-place",
      question: "What is the phone number?",
      mode: "visitor",
    });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.unknowns).toEqual([]);
    expect(Array.isArray(body.suggestedActions)).toBe(true);
    expect(body.proposal === null || typeof body.proposal === "object").toBe(true);
  });
});
