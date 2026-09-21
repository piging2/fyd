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
});

describe("AskFydWidget", () => {
  test("widget module loads (strict compile check)", () => {
    expect(typeof AskFydWidget).toBe("function");
  });
});
