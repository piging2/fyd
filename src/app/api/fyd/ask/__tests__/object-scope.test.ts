/**
 * Object-scoped Ask FYD (Phase 2).
 *
 * POST /api/fyd/ask (and /api/fyd/ask/[siteId]) accept an optional
 * objectId: the question is answered about one object in the route
 * tenant's public graph, with 1-hop related context. Tenant selection
 * never crosses (unknown/other-tenant/non-public id -> 404
 * unknown_object); related objects' evidence is cited as their own,
 * never merged into the target's record.
 *
 * Covers both tenant business objects, related service/location/person/
 * external-identity objects, cross-object leakage prevention, evidence
 * absence (-> UNKNOWN), and the four visitor questions on both tenants:
 * "what services do they offer?", "where are they located?",
 * "who is associated?", "how do you know?".
 *
 * FYD-001 (2026-09-22): both tenants now carry REAL service objects
 * extracted from their homepages. The old demo-overlay synthetic service
 * (website-service-51de038c1defe8bd) is deactivated (private) and must
 * fail closed for visitors.
 *
 * Run: npx jest --config src/fyd/ask/jest.config.cjs
 */
import {
  answerAskFyd,
  type AnswerAskFydDeps,
} from "../../../../../fyd/ask/visitor-answer";
import {
  getSiteBundle,
  type SiteBundle,
} from "../../../../../fyd/media/site-bundle";
import type { PingObject } from "../../../../../lib/ping/types";
import { answerClassFor, handleAskRequest } from "../ask-pipeline";
import { POST as postFlat } from "../route";
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

const HAPPY = "happy-place";
const COPPER = "coppersmith-plumbing";
const HAPPY_BIZ = "website-business-6fa5ebd99d72c4cb";
const HAPPY_LOC = "website-business-6fa5ebd99d72c4cb-location";
const HAPPY_SVC = "website-business-6fa5ebd99d72c4cb-service-3263502c8175"; // Repairs (real)
const HAPPY_SVC_SYNTHETIC = "website-service-51de038c1defe8bd"; // deactivated demo overlay, private
const HAPPY_SERVICES = [
  "website-business-6fa5ebd99d72c4cb-service-3263502c8175", // Repairs
  "website-business-6fa5ebd99d72c4cb-service-340c39513223", // Fencing
  "website-business-6fa5ebd99d72c4cb-service-7f1139c11dab", // Painting
  "website-business-6fa5ebd99d72c4cb-service-c63c87ed8420", // Drywall
  "website-business-6fa5ebd99d72c4cb-service-cd28e52699a5", // Restoration
];
const COPPER_SERVICES = [
  "website-business-2f1327c09d622175-service-139408827c27", // Plumbing
  "website-business-2f1327c09d622175-service-2dbc12c16f83", // Heating & Cooling
  "website-business-2f1327c09d622175-service-78962f315c55", // HVAC
  "website-business-2f1327c09d622175-service-a2008c93fb04", // Ventilation
];
const COPPER_BIZ = "website-business-2f1327c09d622175";
const COPPER_LOC = "website-business-2f1327c09d622175-location";
const COPPER_PERSON = "website-business-2f1327c09d622175-person-377048d67856";
const COPPER_EXT = "website-business-2f1327c09d622175-ext-89604af059c2";

function flatReq(body: unknown): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

function nestedCtx(routeSiteId: string, body: unknown) {
  return {
    req: flatReq(body),
    ctx: { params: Promise.resolve({ siteId: routeSiteId }) },
  };
}

function askOk(siteId: string, objectId: string | undefined, question: string) {
  const out = answerAskFyd(
    { siteId, objectId, question, mode: "visitor" },
    DEPS,
  );
  if (!out.ok) throw new Error("expected ok, got " + JSON.stringify(out.error));
  return out;
}

describe("object-scoped ask: business objects, four visitor questions", () => {
  test("happy-place business: services answered from the service object", () => {
    const out = askOk(HAPPY, HAPPY_BIZ, "what services do they offer?");
    expect(out.refusal).toBe(false);
    for (const name of ["Repairs", "Fencing", "Painting", "Drywall", "Restoration"]) {
      expect(out.answer).toContain(name);
    }
    expect(out.answer).not.toContain("Pergola");
    expect(out.citations.length).toBeGreaterThan(0);
    expect(out.citations.every((c) => HAPPY_SERVICES.includes(c.id))).toBe(true);
    expect(answerClassFor(out.refusal, out.citations, out.claimClassifications)).toBe("SUPPORTED BY MULTIPLE EVIDENCE");
  });

  test("happy-place business: location answered from the location object", () => {
    const out = askOk(HAPPY, HAPPY_BIZ, "where are they located?");
    expect(out.refusal).toBe(false);
    expect(out.answer).toContain("Adair Village");
    expect(out.citations.every((c) => c.id === HAPPY_LOC)).toBe(true);
    expect(answerClassFor(out.refusal, out.citations, out.claimClassifications)).toBe("SUPPORTED DIRECTLY");
  });

  test("happy-place business: association answered from relationships", () => {
    const out = askOk(HAPPY, HAPPY_BIZ, "who is associated?");
    expect(out.refusal).toBe(false);
    expect(out.answer).toContain("Adair Village");
    for (const c of out.citations) {
      expect([HAPPY_BIZ, HAPPY_LOC, ...HAPPY_SERVICES]).toContain(c.id);
    }
    expect(answerClassFor(out.refusal, out.citations, out.claimClassifications)).toBe("SUPPORTED BY MULTIPLE EVIDENCE");
  });

  test("happy-place business: provenance question answered from the record", () => {
    const out = askOk(HAPPY, HAPPY_BIZ, "how do you know?");
    expect(out.refusal).toBe(false);
    expect(out.answer).toMatch(/site record/i);
    expect(out.citations.every((c) => c.id === HAPPY_BIZ)).toBe(true);
    expect(answerClassFor(out.refusal, out.citations, out.claimClassifications)).toBe("SUPPORTED DIRECTLY");
  });

  test("coppersmith business: location, association, provenance answered", () => {
    const where = askOk(COPPER, COPPER_BIZ, "where are they located?");
    expect(where.refusal).toBe(false);
    expect(where.answer).toMatch(/Grand Junction/i);
    expect(where.citations.every((c) => c.id === COPPER_LOC)).toBe(true);
    expect(answerClassFor(where.refusal, where.citations, where.claimClassifications)).toBe("SUPPORTED DIRECTLY");

    const assoc = askOk(COPPER, COPPER_BIZ, "who is associated?");
    expect(assoc.refusal).toBe(false);
    expect(assoc.answer).toContain("coppersmithplm");
    expect(answerClassFor(assoc.refusal, assoc.citations, assoc.claimClassifications)).toBe("SUPPORTED BY MULTIPLE EVIDENCE");

    const prov = askOk(COPPER, COPPER_BIZ, "how do you know?");
    expect(prov.refusal).toBe(false);
    expect(prov.citations.every((c) => c.id === COPPER_BIZ)).toBe(true);
    expect(answerClassFor(prov.refusal, prov.citations, prov.claimClassifications)).toBe("SUPPORTED DIRECTLY");
  });

  test("coppersmith business: services answered from real service objects", () => {
    // FYD-001: 4 real service cards extracted from the homepage. The honest
    // answer names them from service objects, never invents.
    const out = askOk(COPPER, COPPER_BIZ, "what services do they offer?");
    expect(out.refusal).toBe(false);
    for (const name of ["Plumbing", "Heating & Cooling", "HVAC", "Ventilation"]) {
      expect(out.answer).toContain(name);
    }
    expect(out.citations.length).toBeGreaterThan(0);
    expect(out.citations.every((c) => COPPER_SERVICES.includes(c.id))).toBe(true);
    expect(answerClassFor(out.refusal, out.citations, out.claimClassifications)).toBe("SUPPORTED BY MULTIPLE EVIDENCE");
  });
});

describe("object-scoped ask: related objects", () => {
  test("service object answers about itself from its own evidence", () => {
    const out = askOk(HAPPY, HAPPY_SVC, "Tell me about this service.");
    expect(out.refusal).toBe(false);
    expect(out.answer).toContain("Repairs");
    expect(out.citations.every((c) => c.id === HAPPY_SVC)).toBe(true);
    expect(answerClassFor(out.refusal, out.citations, out.claimClassifications)).toBe("SUPPORTED DIRECTLY");
  });

  test("deactivated synthetic service fails closed as unknown_object", () => {
    // The old demo-overlay service is private: visitors must never see it.
    const out = answerAskFyd(
      {
        siteId: HAPPY,
        objectId: HAPPY_SVC_SYNTHETIC,
        question: "Tell me about this service.",
        mode: "visitor",
      },
      DEPS,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe("unknown_object");
  });

  test("location object answers from its own record", () => {
    const out = askOk(HAPPY, HAPPY_LOC, "where are they located?");
    expect(out.refusal).toBe(false);
    expect(out.answer).toContain("Adair Village");
    expect(out.citations.every((c) => c.id === HAPPY_LOC)).toBe(true);
  });

  test("person object: associations cite the related objects' evidence", () => {
    const out = askOk(COPPER, COPPER_PERSON, "who is associated?");
    expect(out.refusal).toBe(false);
    expect(out.answer).toContain("coppersmithplm");
    expect(out.answer).toContain("Coppersmith");
    expect(out.answer).toContain("coppersmithplumbing.com");
    for (const c of out.citations) {
      expect([COPPER_PERSON, COPPER_BIZ, COPPER_EXT]).toContain(c.id);
    }
    expect(answerClassFor(out.refusal, out.citations, out.claimClassifications)).toBe("SUPPORTED BY MULTIPLE EVIDENCE");
  });

  test("external identity object answers from its own record", () => {
    const out = askOk(COPPER, COPPER_EXT, "What is this?");
    expect(out.refusal).toBe(false);
    expect(out.citations.every((c) => c.id === COPPER_EXT)).toBe(true);
    expect(answerClassFor(out.refusal, out.citations, out.claimClassifications)).toBe("SUPPORTED DIRECTLY");
  });
});

describe("object-scoped ask: no cross-object leakage", () => {
  test("service-circle location question cannot borrow the business location", () => {
    const out = askOk(HAPPY, HAPPY_SVC, "where are they located?");
    expect(out.answer).not.toContain("Adair Village");
    expect(out.citations.every((c) => c.id === HAPPY_SVC)).toBe(true);
  });

  test("person-circle location question has no location evidence", () => {
    const out = askOk(COPPER, COPPER_PERSON, "where are they located?");
    expect(out.answer).not.toMatch(/Grand Junction/i);
    expect(out.citations.every((c) => c.id === COPPER_PERSON)).toBe(true);
  });

  test("business service answer cites the service object, never the business", () => {
    const out = askOk(HAPPY, HAPPY_BIZ, "what services do they offer?");
    expect(out.citations.every((c) => HAPPY_SERVICES.includes(c.id))).toBe(true);
  });
});

describe("object-scoped ask: evidence absence is UNKNOWN", () => {
  test("question with no evidence on the object refuses without citations", () => {
    const out = askOk(HAPPY, HAPPY_SVC, "Do you offer financing?");
    expect(out.refusal).toBe(true);
    expect(out.citations).toEqual([]);
    expect(out.answer).toMatch(/do not have evidence/i);
    expect(answerClassFor(out.refusal, out.citations, out.claimClassifications)).toBe("UNSUPPORTED");
  });
});

describe("object-scoped ask: tenant and visibility gates", () => {
  test("object id from another tenant fails closed as unknown_object", () => {
    const out = answerAskFyd(
      {
        siteId: HAPPY,
        objectId: COPPER_BIZ,
        question: "What is this?",
        mode: "visitor",
      },
      DEPS,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe("unknown_object");
  });

  test("unknown object id fails closed as unknown_object", () => {
    const out = answerAskFyd(
      {
        siteId: HAPPY,
        objectId: "no-such-object",
        question: "What is this?",
        mode: "visitor",
      },
      DEPS,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe("unknown_object");
  });

  test("non-public object id fails closed as unknown_object", () => {
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
    const out = answerAskFyd(
      {
        siteId: "happy-place-test",
        objectId: secret.id,
        question: "What is this?",
        mode: "visitor",
      },
      deps,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.kind).toBe("unknown_object");
  });

  test("omitting objectId keeps the legacy site-scoped behavior", () => {
    const out = askOk(HAPPY, undefined, "what services do they offer?");
    expect(out.refusal).toBe(false);
    expect(out.answer).toContain("Repairs");
    expect(out.answer).not.toContain("Pergola");
  });
});

describe("object-scoped ask: route wiring", () => {
  test("flat POST with objectId answers 200 with the 5-class contract", async () => {
    const res = await postFlat(
      flatReq({
        siteId: HAPPY,
        objectId: HAPPY_BIZ,
        question: "where are they located?",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.answerClass).toBe("SUPPORTED DIRECTLY");
    expect(body.answer).toContain("Adair Village");
    expect(body.answerState).toBe("KNOWN");
    expect(body.tenantId).toBe(HAPPY);
  });

  test("flat POST with another tenant's object id is 404 and leaks nothing", async () => {
    const res = await postFlat(
      flatReq({ siteId: HAPPY, objectId: COPPER_BIZ, question: "What is this?" }),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toContain("Coppersmith");
  });

  test("flat POST with unknown object id is 404", async () => {
    const res = await postFlat(
      flatReq({ siteId: HAPPY, objectId: "no-such-object", question: "What is this?" }),
    );
    expect(res.status).toBe(404);
  });

  test("nested route passes objectId through for the route tenant", async () => {
    const { req, ctx } = nestedCtx(HAPPY, {
      objectId: HAPPY_SVC,
      question: "Tell me about this service.",
    });
    const res = await postNested(req, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.answer).toContain("Repairs");
    expect(body.tenantId).toBe(HAPPY);
  });

  test("nested route still refuses a body siteId that disagrees with the route tenant", async () => {
    const { req, ctx } = nestedCtx(HAPPY, {
      siteId: COPPER,
      objectId: HAPPY_BIZ,
      question: "What is this?",
    });
    const res = await postNested(req, ctx);
    expect(res.status).toBe(400);
  });

  test("shared pipeline helper accepts objectId on both route shapes", async () => {
    const flat = await handleAskRequest(
      null,
      flatReq({
        siteId: HAPPY,
        objectId: HAPPY_BIZ,
        question: "where are they located?",
      }),
    );
    expect(flat.status).toBe(200);
    expect((await flat.json()).answer).toContain("Adair Village");

    const nested = await handleAskRequest(
      HAPPY,
      flatReq({ objectId: COPPER_BIZ, question: "What is this?" }),
    );
    // objectId never selects the tenant: the other tenant's id is unknown
    // for the route tenant.
    expect(nested.status).toBe(404);
  });
});
