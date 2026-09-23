/**
 * Ask FYD 3-class + tenant-boundary route tests (Phase 2 / G3).
 *
 * - claimClassFor / answerClassFor mapping unit tests.
 * - G3 adversarial: POST /api/fyd/ask/[siteId] derives the tenant from the
 *   route path. A body that claims tenant B while the route is tenant A is
 *   REFUSED (400 tenant_mismatch): served for A or refused, never for B.
 * - 3-class wiring: SUPPORTED / DERIVED (explicitly labeled) / UNKNOWN
 *   (refusal) on live answers, with per-citation claimClass.
 * - Visitor vs owner scope: mode "owner" grants nothing (treated
 *   visitor-safe); an owner-private fact asked in visitor mode AND in owner
 *   mode is refused/unknown, never leaked.
 */
import { claimClassFor, answerAskFyd, type AnswerAskFydDeps } from "../../../../../fyd/ask/visitor-answer";
import { answerClassFor } from "../ask-pipeline";
import { getSiteBundle, type SiteBundle } from "../../../../../fyd/media/site-bundle";
import type { PingObject } from "../../../../../lib/ping/types";
import { POST as postFlat } from "../route";
import { POST as postNested } from "../[siteId]/route";
import type { NextRequest } from "next/server";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

function flatReq(body: unknown) {
  return { json: async () => body } as unknown as NextRequest;
}
function nestedReq(siteId: string, body: unknown) {
  return {
    req: { json: async () => body } as unknown as NextRequest,
    params: Promise.resolve({ siteId }),
  };
}

describe("claimClassFor (3-class mapping)", () => {
  test.each([
    ["DIRECT_FACT", "supported"],
    ["relationship_fact", "supported"],
    ["USER_OVERRIDE", "supported"],
    ["owner_override", "supported"],
    ["owner_authorship", "supported"],
    ["website_statement", "supported"],
    ["unknown", "supported"],
    [undefined, "supported"],
  ])("classification %p maps to %p", (classification, expected) => {
    expect(claimClassFor(classification as string | undefined)).toBe(expected);
  });

  test.each([["DERIVED_FACT"], ["derived"], ["INFERENCE"], ["GENERATED_COPY"]])(
    "classification %p is explicitly derived",
    (classification) => {
      expect(claimClassFor(classification)).toBe("derived");
    },
  );
});

describe("answerClassFor (answer-level reduction)", () => {
  test("refusal is unknown even with no citations", () => {
    expect(answerClassFor(true, [])).toBe("unknown");
  });
  test("answered with no citations is unknown", () => {
    expect(answerClassFor(false, [])).toBe("unknown");
  });
  test("all-supported citations is supported", () => {
    expect(
      answerClassFor(false, [
        { n: 1, id: "a", label: "a", source: "s", basis: "b", lastChecked: null, claimClass: "supported" },
      ]),
    ).toBe("supported");
  });
  test("any derived citation makes the answer derived", () => {
    expect(
      answerClassFor(false, [
        { n: 1, id: "a", label: "a", source: "s", basis: "b", lastChecked: null, claimClass: "supported" },
        { n: 2, id: "b", label: "b", source: "s", basis: "Derived from the site data", lastChecked: null, claimClass: "derived" },
      ]),
    ).toBe("derived");
  });
});

describe("G3: nested route derives tenant from the path", () => {
  test("body claims tenant B while route is tenant A -> 400 tenant_mismatch, never serves B", async () => {
    for (const key of ["siteId", "tenantId", "tenant"]) {
      const { req, params } = nestedReq("happy-place", {
        [key]: "coppersmith-plumbing",
        question: "What is the phone number?",
        mode: "visitor",
      });
      const resp = await postNested(req, { params });
      expect(resp.status).toBe(400);
      const body = (await resp.json()) as Record<string, unknown>;
      expect(body.ok).toBe(false);
      expect(body.code).toBe("tenant_mismatch");
      // Nothing was served for the claimed tenant: no answer, no citations.
      expect(body.answer).toBeUndefined();
      expect(body.citations).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain("Coppersmith");
    }
  });

  test("reverse direction also refused: route B, body claims A", async () => {
    const { req, params } = nestedReq("coppersmith-plumbing", {
      siteId: "happy-place",
      question: "What is the phone number?",
    });
    const resp = await postNested(req, { params });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as Record<string, unknown>;
    expect(body.code).toBe("tenant_mismatch");
  });

  test("matching body tenant claim is ignored; route tenant is served", async () => {
    const { req, params } = nestedReq("happy-place", {
      siteId: "happy-place",
      question: "What is the phone number?",
      mode: "visitor",
    });
    const resp = await postNested(req, { params });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.tenantId).toBe("happy-place");
    expect(body.answer).toContain("+15412865190");
  });

  test("no body tenant claim: route tenant served with 3-class labels", async () => {
    const { req, params } = nestedReq("happy-place", {
      question: "What is the phone number?",
    });
    const resp = await postNested(req, { params });
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      ok: boolean;
      answerClass: string;
      refusal: boolean;
      tenantId: string;
      citations: { claimClass: string }[];
    };
    expect(body.ok).toBe(true);
    expect(body.tenantId).toBe("happy-place");
    expect(body.answerClass).toBe("supported");
    expect(body.refusal).toBe(false);
    expect(body.citations.length).toBeGreaterThan(0);
    for (const c of body.citations) {
      expect(["supported", "derived"]).toContain(c.claimClass);
    }
  });

  test("invalid route tenant is refused before any I/O", async () => {
    const { req, params } = nestedReq("../../etc", { question: "hi" });
    const resp = await postNested(req, { params });
    expect(resp.status).toBe(400);
    const body = (await resp.json()) as Record<string, unknown>;
    expect(body.code).toBe("invalid_tenant");
  });
});

describe("3-class wiring on live answers", () => {
  test("SUPPORTED: known phone question answers from cited evidence", async () => {
    const resp = await postFlat(
      flatReq({ siteId: "happy-place", question: "What is the phone number?", mode: "visitor" }),
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      ok: boolean;
      answer: string;
      answerClass: string;
      refusal: boolean;
      citations: { claimClass: string; basis: string }[];
    };
    expect(body.answerClass).toBe("supported");
    expect(body.refusal).toBe(false);
    expect(body.answer).toContain("+15412865190");
    expect(body.citations.every((c) => c.claimClass === "supported")).toBe(true);
  });

  test("UNKNOWN: question with no evidence is refused, never invented", async () => {
    const resp = await postFlat(
      flatReq({ siteId: "happy-place", question: "Does this business offer financing?", mode: "visitor" }),
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      ok: boolean;
      answer: string;
      answerClass: string;
      refusal: boolean;
      citations: unknown[];
    };
    expect(body.answerClass).toBe("unknown");
    expect(body.refusal).toBe(true);
    expect(body.citations).toEqual([]);
    expect(body.answer).toMatch(/do not have evidence/i);
  });

  test("DERIVED: a DERIVED_FACT claim is explicitly labeled derived", () => {
    const real = HAPPY_BUNDLE;
    expect(real).not.toBeNull();
    const objects = (real as SiteBundle).graph.objects.map((o) =>
      o.schema === "ping.social.business@1"
        ? { ...o, fields: { ...o.fields, claimKind: "DERIVED_FACT" } }
        : o,
    );
    const bundle: SiteBundle = {
      ...(real as SiteBundle),
      graph: { objects, relationships: (real as SiteBundle).graph.relationships },
    };
    const deps: AnswerAskFydDeps = {
      loadBundle: (id) => (id === "happy-place-derived" ? bundle : null),
    };
    const out = answerAskFyd(
      { siteId: "happy-place-derived", question: "What is the phone number?", mode: "visitor" },
      deps,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.refusal).toBe(false);
    expect(out.citations.length).toBeGreaterThan(0);
    // Every citation from the DERIVED_FACT object is explicitly derived.
    expect(out.citations.every((c) => c.claimClass === "derived")).toBe(true);
    expect(
      out.citations.every((c) => /derived/i.test(c.basis)),
    ).toBe(true);
  });
});

describe("visitor vs owner scope", () => {
  const secret: PingObject = {
    id: "website-business-owner-diary",
    schema: "ping.social.business@1",
    controllerId: "identity_fyd_test",
    visibility: "private",
    title: "Owner Diary",
    description: "Owner-private notes.",
    fields: { internal_note: "OWNER-SECRET-ABC-123 do not share" },
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    provenance: {
      kind: "website-derived",
      ref: "website-ingestion:https://example.invalid/",
      derivedAt: "2026-09-20T00:00:00.000Z",
    },
  };

  function depsWithSecret(): AnswerAskFydDeps {
    const real = HAPPY_BUNDLE;
    if (!real) throw new Error("happy-place bundle missing");
    const bundle: SiteBundle = {
      ...real,
      graph: {
        objects: [...real.graph.objects, secret],
        relationships: real.graph.relationships,
      },
    };
    return { loadBundle: (id) => (id === "happy-place-secret" ? bundle : null) };
  }

  test.each(["visitor", "owner"] as const)(
    "owner-private fact asked in %p mode is refused/unknown, never leaked",
    (mode) => {
      const deps = depsWithSecret();
      for (const question of [
        "What does the internal note say?",
        "Tell me the owner secret",
      ]) {
        const out = answerAskFyd({ siteId: "happy-place-secret", question, mode }, deps);
        expect(out.ok).toBe(true);
        if (!out.ok) continue;
        expect(out.answer).not.toContain("OWNER-SECRET-ABC-123");
        expect(
          out.citations.every((c) => !c.label.includes("Owner Diary")),
        ).toBe(true);
        // Either an explicit refusal or an answer that never touches the secret.
        if (out.refusal) expect(out.citations).toEqual([]);
      }
    },
  );

  test('mode "owner" grants nothing: it answers exactly like a visitor', async () => {
    const visitor = await postFlat(
      flatReq({ siteId: "happy-place", question: "What is the phone number?", mode: "visitor" }),
    );
    const owner = await postFlat(
      flatReq({ siteId: "happy-place", question: "What is the phone number?", mode: "owner" }),
    );
    const vBody = (await visitor.json()) as { answer: string; answerClass: string };
    const oBody = (await owner.json()) as { answer: string; answerClass: string };
    expect(oBody.answer).toBe(vBody.answer);
    expect(oBody.answerClass).toBe(vBody.answerClass);
  });

  test("SUPPORTED: an approved owner correction is answered by Ask FYD citing the owner override", async () => {
    // Apply a correction through the REAL owner store (the same apply step
    // the overrides route runs), then ask through the REAL trusted route:
    // the route composes the owner overlay over the bundle before answering.
    const prevDir = process.env.FYD_OWNER_DIR;
    process.env.FYD_OWNER_DIR = mkdtempSync(join(tmpdir(), "fyd-owner-ask-"));
    try {
      const store = jest.requireActual(
        "../../../../../fyd/object/owner-store",
      ) as typeof import("../../../../../fyd/object/owner-store");
      const viewMod = jest.requireActual(
        "../../../../../fyd/object/view",
      ) as typeof import("../../../../../fyd/object/view");
      const srcMod = jest.requireActual(
        "../../../../../fyd/data/ping-object-source",
      ) as typeof import("../../../../../fyd/data/ping-object-source");
      const overlayMod = jest.requireActual(
        "../../../../../fyd/object/owner-overlay",
      ) as typeof import("../../../../../fyd/object/owner-overlay");
      const { ids, names } = viewMod.knownServices("happy-place");
      const command = store.parseOwnerCommand({
        type: "set-contact-field",
        field: "phone",
        value: "+1 541 555 0123",
      });
      // The source's value as what the source says, read from the raw
      // projection exactly the way the approve stage reads it.
      const rawGraph = srcMod.getPingObjectGraphSync("happy-place", {
        ownerOverlay: false,
      }).graph;
      const rawBusiness = overlayMod.findBusinessObject(rawGraph);
      const sourceValue = rawBusiness
        ? overlayMod.rawFieldValue(rawBusiness, "phone")
        : null;
      expect(sourceValue).toBe("+15412865190");
      store.applyOwnerCommand("happy-place", command, ids, names, {
        sourceValue,
        actorLabel: "Demo Owner (seeded, unverified)",
      });

      const { req, params } = nestedReq("happy-place", {
        question: "What is the phone number?",
        mode: "visitor",
      });
      const resp = await postNested(req, { params });
      expect(resp.status).toBe(200);
      const body = (await resp.json()) as {
        ok: boolean;
        answer: string;
        answerClass: string;
        refusal: boolean;
        citations: { claimClass: string; source: string; basis: string; label: string }[];
      };
      expect(body.ok).toBe(true);
      expect(body.refusal).toBe(false);
      expect(body.answerClass).toBe("supported");
      // The ANSWERED value is the owner's, and the answer says so.
      expect(body.answer).toContain("+1 541 555 0123");
      expect(body.answer).toMatch(/owner corrected/i);
      // The citation names the owner correction as its source (not the
      // website), classified supported: an owner-set value is cited
      // evidence, never a derived claim.
      const ownerCites = body.citations.filter((c) => /owner correction/i.test(c.source));
      expect(ownerCites.length).toBeGreaterThan(0);
      expect(ownerCites.every((c) => c.claimClass === "supported")).toBe(true);
    } finally {
      if (prevDir === undefined) delete process.env.FYD_OWNER_DIR;
      else process.env.FYD_OWNER_DIR = prevDir;
    }
  });
});
