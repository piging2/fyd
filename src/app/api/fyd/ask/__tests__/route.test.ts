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
import { POST } from "../route";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NextRequest } from "next/server";

const DEPS: AnswerAskFydDeps = { loadBundle: getSiteBundle };

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
    expect(out.answer).toMatch(/do not have evidence/i);
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
    const real = getSiteBundle("happy-place");
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
    const real = getSiteBundle("happy-place");
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
                field: "phone",
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

describe("AskFydWidget", () => {
  test("widget module loads (strict compile check)", () => {
    expect(typeof AskFydWidget).toBe("function");
  });
});
describe("corrupt projection (FL: Ask FYD error mapping)", () => {
  // The production projection dir; the suite already depends on these files
  // (see the known-question tests above).
  const realDir = "/home/nolan/ping/var/fyd-projections";

  function tempDirWith(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), "fyd-ask-corrupt-"));
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, name), content, "utf8");
    }
    return dir;
  }

  function tamperedCopy(): string {
    const real = JSON.parse(
      readFileSync(join(realDir, "happy-place.json"), "utf8"),
    ) as { meta: Record<string, unknown> };
    real.meta.graphDigest = "0".repeat(64);
    return JSON.stringify(real);
  }

  function postAsk(body: unknown) {
    // The route only ever calls request.json().
    const req = { json: async () => body } as unknown as NextRequest;
    return POST(req);
  }

  let savedDir: string | undefined;
  beforeEach(() => {
    savedDir = process.env.FYD_PROJECTION_DIR;
  });
  afterEach(() => {
    if (savedDir === undefined) delete process.env.FYD_PROJECTION_DIR;
    else process.env.FYD_PROJECTION_DIR = savedDir;
  });

  test("answerAskFyd maps a throwing loader to projection_unavailable, never throws", () => {
    const deps: AnswerAskFydDeps = {
      loadBundle: () => {
        throw new Error(
          'ping-object-source: site "happy-place": projection is not valid JSON',
        );
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

  test("POST returns structured 503 when the projection JSON is corrupt", async () => {
    process.env.FYD_PROJECTION_DIR = tempDirWith({
      "happy-place.json": "{ this is not valid json",
    });
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
    expect(body.error as string).not.toContain("fyd-projections");
    expect(body.error as string).not.toContain("/home/");
  });

  test("POST returns structured 503 when the projection digest is tampered", async () => {
    process.env.FYD_PROJECTION_DIR = tempDirWith({
      "happy-place.json": tamperedCopy(),
    });
    const resp = await postAsk({
      siteId: "happy-place",
      question: "What services do you offer?",
      mode: "visitor",
    });
    expect(resp.status).toBe(503);
    const body = (await resp.json()) as Record<string, unknown>;
    expect(body.kind).toBe("projection_unavailable");
    expect(body.answerUnknown).toBe(true);
  });

  test("recovery: POST answers normally again once the projection is restored", async () => {
    process.env.FYD_PROJECTION_DIR = tempDirWith({
      "happy-place.json": readFileSync(join(realDir, "happy-place.json"), "utf8"),
    });
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
