/**
 * TRACK C (website builder harvest), 2026-09-28.
 * Tests for the typed SitePatch pipeline:
 * PATCH -> VALIDATE -> CAPABILITY -> PREVIEW -> APPROVAL (seam) ->
 * EVENT -> NEW SPEC VERSION.
 *
 * Covers all 10 ops, digest determinism, the frozen layer-law refusal
 * of SET_DESIGN_TOKEN, exact-digest approval verification, and replay
 * survival (approved intent re-applied over a regenerated base).
 */

import { opMappingOf, SITE_PATCH_OP_MAP } from "../types";
import { emitGateProposal, verifyGateDecision } from "../approval-seam";
import {
  applyExtendedSitePatch,
  capabilityForOp,
  previewSitePatch,
  proposeForOp,
  runSitePatchPipeline,
  validateSitePatchOp,
  TRACKC_DEMO_OWNER,
  type PipelineContext,
} from "../pipeline";
import type { FYDSiteSpec } from "../../sitespec/types";

const NOW = "2026-09-28T22:00:00.000Z";

function fixtureSpec(): FYDSiteSpec {
  return {
    kind: "fyd.sitespec@1",
    ownerObjectId: "website-business-test",
    version: 1,
    generator: { name: "fyd-site-generator", version: "test", generatedAt: "2026-09-21T00:00:00Z" },
    themeTokens: {
      accent: "#b45309",
      accentForeground: "#ffffff",
      surface: "#ffffff",
      ink: "#1c1917",
      radius: "md",
      fontDisplay: "serif",
      fontBody: "sans",
    },
    navigation: [{ label: "Home", pageSlug: "home" }],
    pages: [
      {
        slug: "home",
        title: "Home",
        navLabel: "Home",
        sections: [
          {
            id: "home:Hero:0",
            component: "Hero",
            query: { kind: "owner" },
            presentation: { heading: "Welcome" },
          },
          {
            id: "home:Services:1",
            component: "Services",
            query: { kind: "related", from: "website-business-test", predicate: "offers" },
            presentation: { heading: "Our Services" },
          },
          {
            id: "home:Contact:2",
            component: "Contact",
            query: { kind: "owner" },
            presentation: { heading: "Contact" },
          },
        ],
      },
    ],
    provenance: {
      source: "website-ingestion",
      claimKind: "website_statement",
      note: "test fixture",
    },
  };
}

function ctx(): PipelineContext {
  return {
    siteId: "test-site",
    tenantId: "demo-tenant",
    actorId: TRACKC_DEMO_OWNER,
    targetObjectId: "website-business-test",
    evidenceLink: "/sites/test-site",
    nowIso: NOW,
  };
}

describe("Track C SitePatch op vocabulary", () => {
  test("all 10 required ops are typed and mapped", () => {
    const kinds = [
      "MOVE_SECTION",
      "ADD_SECTION",
      "REMOVE_SECTION",
      "SET_VISIBILITY",
      "SET_FEATURED_OBJECT",
      "SET_DESIGN_TOKEN",
      "SET_PRESENTATION_COPY",
      "ADD_PAGE",
      "REMOVE_PAGE",
      "CHANGE_QUERY",
    ];
    for (const kind of kinds) {
      expect(SITE_PATCH_OP_MAP[kind as keyof typeof SITE_PATCH_OP_MAP]).toBeDefined();
    }
    // Reconciliation record: covered kinds adopt the canonical machinery.
    expect(opMappingOf("MOVE_SECTION").disposition).toBe("ADOPT");
    expect(opMappingOf("SET_VISIBILITY").disposition).toBe("ADOPT");
    expect(opMappingOf("SET_FEATURED_OBJECT").disposition).toBe("ADOPT");
    expect(opMappingOf("SET_PRESENTATION_COPY").disposition).toBe("ADOPT");
    expect(opMappingOf("ADD_SECTION").disposition).toBe("ADAPT");
    expect(opMappingOf("REMOVE_SECTION").disposition).toBe("ADAPT");
    expect(opMappingOf("ADD_PAGE").disposition).toBe("ADAPT");
    expect(opMappingOf("REMOVE_PAGE").disposition).toBe("ADAPT");
    expect(opMappingOf("CHANGE_QUERY").disposition).toBe("ADAPT");
    expect(opMappingOf("SET_DESIGN_TOKEN").disposition).toBe("REFUSE");
  });
});

describe("VALIDATE", () => {
  test("MOVE_SECTION validates target and index", () => {
    expect(
      validateSitePatchOp(fixtureSpec(), {
        kind: "MOVE_SECTION",
        pageSlug: "home",
        sectionId: "home:Services:1",
        toIndex: 0,
      }),
    ).toEqual([]);
    expect(
      validateSitePatchOp(fixtureSpec(), {
        kind: "MOVE_SECTION",
        pageSlug: "nope",
        sectionId: "home:Services:1",
        toIndex: 0,
      }).length,
    ).toBeGreaterThan(0);
    expect(
      validateSitePatchOp(fixtureSpec(), {
        kind: "MOVE_SECTION",
        pageSlug: "home",
        sectionId: "home:Services:1",
        toIndex: 9,
      }).length,
    ).toBeGreaterThan(0);
  });

  test("REMOVE_SECTION refuses the last section; REMOVE_PAGE refuses home and the last page", () => {
    const oneSection = fixtureSpec();
    oneSection.pages[0].sections = oneSection.pages[0].sections.slice(0, 1);
    expect(
      validateSitePatchOp(oneSection, {
        kind: "REMOVE_SECTION",
        pageSlug: "home",
        sectionId: "home:Hero:0",
      }).length,
    ).toBeGreaterThan(0);
    expect(
      validateSitePatchOp(fixtureSpec(), { kind: "REMOVE_PAGE", slug: "home" }).length,
    ).toBeGreaterThan(0);
  });

  test("ADD_PAGE validates slug shape and duplicates", () => {
    expect(
      validateSitePatchOp(fixtureSpec(), {
        kind: "ADD_PAGE",
        slug: "Bad Slug!",
        title: "Bad",
        navLabel: "Bad",
      }).length,
    ).toBeGreaterThan(0);
    expect(
      validateSitePatchOp(fixtureSpec(), {
        kind: "ADD_PAGE",
        slug: "home",
        title: "Dup",
        navLabel: "Dup",
      }).length,
    ).toBeGreaterThan(0);
    expect(
      validateSitePatchOp(fixtureSpec(), {
        kind: "ADD_PAGE",
        slug: "services",
        title: "Services",
        navLabel: "Services",
      }),
    ).toEqual([]);
  });

  test("SET_PRESENTATION_COPY needs a heading or copy; CHANGE_QUERY needs a valid query", () => {
    expect(
      validateSitePatchOp(fixtureSpec(), {
        kind: "SET_PRESENTATION_COPY",
        pageSlug: "home",
        sectionId: "home:Hero:0",
      }).length,
    ).toBeGreaterThan(0);
    expect(
      validateSitePatchOp(fixtureSpec(), {
        kind: "CHANGE_QUERY",
        pageSlug: "home",
        sectionId: "home:Services:1",
        query: { kind: "bogus" } as never,
      }).length,
    ).toBeGreaterThan(0);
  });
});

describe("CAPABILITY", () => {
  test("SET_DESIGN_TOKEN is refused by the frozen layer law", () => {
    const verdict = capabilityForOp(
      { kind: "SET_DESIGN_TOKEN", token: "accent", value: "#000000" },
      TRACKC_DEMO_OWNER,
    );
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toMatch(/not customizable/i);
  });

  test("non-owner actors are refused; demo owner is allowed", () => {
    const op = { kind: "MOVE_SECTION", pageSlug: "home", sectionId: "home:Services:1", toIndex: 0 } as const;
    expect(capabilityForOp(op, "mallory").allowed).toBe(false);
    expect(capabilityForOp(op, TRACKC_DEMO_OWNER).allowed).toBe(true);
  });
});

describe("APPROVAL seam", () => {
  test("gate proposal has the Phase 1 shape and the same digest", () => {
    const spec = fixtureSpec();
    const prop = proposeForOp(spec, {
      kind: "MOVE_SECTION",
      pageSlug: "home",
      sectionId: "home:Services:1",
      toIndex: 0,
    });
    expect(prop.ok).toBe(true);
    if (!prop.ok) return;
    const gate = emitGateProposal({
      siteId: "test-site",
      tenantId: "demo-tenant",
      actorId: TRACKC_DEMO_OWNER,
      targetObjectId: "website-business-test",
      operation: "MOVE_SECTION",
      baseSpec: spec,
      proposal: prop.proposal,
      decisionSentence: "Move the Services section to the top.",
      evidenceLink: "/sites/test-site",
      nowIso: NOW,
    });
    // Same digest: the gate reuses the overlay proposalDigest verbatim.
    expect(gate.proposed_digest).toBe(prop.proposal.proposalDigest);
    expect(gate.proposed_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(gate.base_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(gate.status).toBe("PROPOSED");
    expect(gate.required_capability).toBe("owner.customize-approve");
    expect(gate.seam).toBe("trackc-sitepatch/pending-phase1-binding");
    // Deterministic proposal id.
    const gate2 = emitGateProposal({
      siteId: "test-site",
      tenantId: "demo-tenant",
      actorId: TRACKC_DEMO_OWNER,
      targetObjectId: "website-business-test",
      operation: "MOVE_SECTION",
      baseSpec: spec,
      proposal: prop.proposal,
      decisionSentence: "Move the Services section to the top.",
      evidenceLink: "/sites/test-site",
      nowIso: NOW,
    });
    expect(gate2.proposal_id).toBe(gate.proposal_id);
  });

  test("digest mismatch decides nothing; exact digest approves", () => {
    const spec = fixtureSpec();
    const prop = proposeForOp(spec, {
      kind: "MOVE_SECTION",
      pageSlug: "home",
      sectionId: "home:Services:1",
      toIndex: 0,
    });
    expect(prop.ok).toBe(true);
    if (!prop.ok) return;
    const gate = emitGateProposal({
      siteId: "test-site",
      tenantId: "demo-tenant",
      actorId: TRACKC_DEMO_OWNER,
      targetObjectId: "website-business-test",
      operation: "MOVE_SECTION",
      baseSpec: spec,
      proposal: prop.proposal,
      decisionSentence: "Move the Services section to the top.",
      evidenceLink: "/sites/test-site",
      nowIso: NOW,
    });
    const tampered = verifyGateDecision(gate, "0".repeat(64), "APPROVE");
    expect(tampered.ok).toBe(false);
    if (!tampered.ok) expect(tampered.error).toBe("digest_mismatch");
    const approved = verifyGateDecision(gate, gate.proposed_digest, "APPROVE");
    expect(approved.ok).toBe(true);
    const double = verifyGateDecision(
      approved.ok ? approved.proposal : gate,
      gate.proposed_digest,
      "DENY",
    );
    expect(double.ok).toBe(false);
    if (!double.ok) expect(double.error).toBe("already_decided");
  });
});

describe("full pipeline: MOVE_SECTION", () => {
  test("PATCH -> VALIDATE -> CAPABILITY -> PREVIEW -> APPROVAL -> EVENT -> NEW SPEC VERSION", () => {
    const spec = fixtureSpec();
    const first = runSitePatchPipeline(
      spec,
      { kind: "MOVE_SECTION", pageSlug: "home", sectionId: "home:Services:1", toIndex: 0 },
      ctx(),
    );
    expect(first.validation).toEqual({ ok: true });
    expect(first.capability.allowed).toBe(true);
    expect(first.preview).not.toBeNull();
    expect(first.preview!.after[0]).toMatch(/^Services/);
    expect(first.gateProposal).not.toBeNull();
    // No decision yet: pending proposal only.
    expect(first.decision).toBeNull();
    expect(first.event).toBeNull();
    expect(first.newSpec).toBeNull();

    const approved = runSitePatchPipeline(
      spec,
      { kind: "MOVE_SECTION", pageSlug: "home", sectionId: "home:Services:1", toIndex: 0 },
      { ...ctx(), decide: { verdict: "APPROVE", presentedDigest: first.gateProposal!.proposed_digest } },
    );
    expect(approved.decision).toEqual({ ok: true, status: "APPROVED" });
    expect(approved.event).not.toBeNull();
    expect(approved.event!.op).toBe("set_presentation_intent");
    expect(approved.newSpec).not.toBeNull();
    const order = approved.newSpec!.pages[0].sections.map((s) => s.component);
    expect(order[0]).toBe("Services");
    expect(approved.newSpecDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(approved.newSpecDigest).not.toBe(approved.specDigest);
  });

  test("a refused op stops before preview", () => {
    const staged = runSitePatchPipeline(
      fixtureSpec(),
      { kind: "SET_DESIGN_TOKEN", token: "accent", value: "#000000" },
      ctx(),
    );
    expect(staged.validation).toEqual({ ok: true });
    expect(staged.capability.allowed).toBe(false);
    expect(staged.preview).toBeNull();
    expect(staged.gateProposal).toBeNull();
  });

  test("the move survives regeneration: approved intent replays over a fresh base", () => {
    const spec = fixtureSpec();
    const approved = runSitePatchPipeline(
      spec,
      { kind: "MOVE_SECTION", pageSlug: "home", sectionId: "home:Services:1", toIndex: 0 },
      { ...ctx(), decide: { verdict: "APPROVE", presentedDigest: "PENDING" } },
    );
    // Resolve the real digest first (two-step mirrors gate flow).
    const pending = runSitePatchPipeline(
      spec,
      { kind: "MOVE_SECTION", pageSlug: "home", sectionId: "home:Services:1", toIndex: 0 },
      ctx(),
    );
    const decided = runSitePatchPipeline(
      spec,
      { kind: "MOVE_SECTION", pageSlug: "home", sectionId: "home:Services:1", toIndex: 0 },
      { ...ctx(), decide: { verdict: "APPROVE", presentedDigest: pending.gateProposal!.proposed_digest } },
    );
    expect(decided.decision).toEqual({ ok: true, status: "APPROVED" });
    expect(approved.decision).toEqual({ ok: false, error: "digest_mismatch" });

    // Regeneration: a fresh base (same bytes here; in production re-observed)
    // with the approved proposal re-applied keeps the owner intent.
    const freshBase = fixtureSpec();
    const replayed = applyExtendedSitePatch(freshBase, decided.overlayProposal!);
    expect(replayed.pages[0].sections[0].component).toBe("Services");
  });
});

describe("extended ops apply", () => {
  test("ADD_SECTION / REMOVE_SECTION", () => {
    const spec = fixtureSpec();
    const added = runSitePatchPipeline(
      spec,
      {
        kind: "ADD_SECTION",
        pageSlug: "home",
        component: "Testimonials",
        query: { kind: "all", schema: "Review" },
        heading: "What neighbors say",
      },
      { ...ctx(), decide: { verdict: "APPROVE", presentedDigest: "PENDING" } },
    );
    expect(added.validation).toEqual({ ok: true });
    // Approve with the real digest.
    const pending = runSitePatchPipeline(
      spec,
      {
        kind: "ADD_SECTION",
        pageSlug: "home",
        component: "Testimonials",
        query: { kind: "all", schema: "Review" },
        heading: "What neighbors say",
      },
      ctx(),
    );
    const decided = runSitePatchPipeline(
      spec,
      {
        kind: "ADD_SECTION",
        pageSlug: "home",
        component: "Testimonials",
        query: { kind: "all", schema: "Review" },
        heading: "What neighbors say",
      },
      { ...ctx(), decide: { verdict: "APPROVE", presentedDigest: pending.gateProposal!.proposed_digest } },
    );
    expect(decided.decision).toEqual({ ok: true, status: "APPROVED" });
    const comps = decided.newSpec!.pages[0].sections.map((s) => s.component);
    expect(comps).toContain("Testimonials");

    const removed = runSitePatchPipeline(
      decided.newSpec!,
      { kind: "REMOVE_SECTION", pageSlug: "home", sectionId: "home:Testimonials:3" },
      { ...ctx(), decide: { verdict: "APPROVE", presentedDigest: "PENDING" } },
    );
    expect(removed.validation).toEqual({ ok: true });
  });

  test("ADD_PAGE / REMOVE_PAGE", () => {
    const spec = fixtureSpec();
    const pending = runSitePatchPipeline(
      spec,
      { kind: "ADD_PAGE", slug: "services", title: "Services", navLabel: "Services" },
      ctx(),
    );
    expect(pending.validation).toEqual({ ok: true });
    const decided = runSitePatchPipeline(
      spec,
      { kind: "ADD_PAGE", slug: "services", title: "Services", navLabel: "Services" },
      { ...ctx(), decide: { verdict: "APPROVE", presentedDigest: pending.gateProposal!.proposed_digest } },
    );
    expect(decided.decision).toEqual({ ok: true, status: "APPROVED" });
    expect(decided.newSpec!.pages.map((p) => p.slug)).toContain("services");
    expect(decided.newSpec!.navigation.map((n) => n.pageSlug)).toContain("services");
  });

  test("CHANGE_QUERY rewrites the section query", () => {
    const spec = fixtureSpec();
    const pending = runSitePatchPipeline(
      spec,
      {
        kind: "CHANGE_QUERY",
        pageSlug: "home",
        sectionId: "home:Services:1",
        query: { kind: "reference", objectIds: ["obj-1", "obj-2"] },
      },
      ctx(),
    );
    expect(pending.validation).toEqual({ ok: true });
    const decided = runSitePatchPipeline(
      spec,
      {
        kind: "CHANGE_QUERY",
        pageSlug: "home",
        sectionId: "home:Services:1",
        query: { kind: "reference", objectIds: ["obj-1", "obj-2"] },
      },
      { ...ctx(), decide: { verdict: "APPROVE", presentedDigest: pending.gateProposal!.proposed_digest } },
    );
    expect(decided.decision).toEqual({ ok: true, status: "APPROVED" });
    const sec = decided.newSpec!.pages[0].sections.find((s) => s.id === "home:Services:1");
    expect(sec!.query).toEqual({ kind: "reference", objectIds: ["obj-1", "obj-2"] });
  });

  test("SET_VISIBILITY and SET_PRESENTATION_COPY ride the canonical kinds", () => {
    const spec = fixtureSpec();
    const vis = runSitePatchPipeline(
      spec,
      { kind: "SET_VISIBILITY", pageSlug: "home", sectionId: "home:Contact:2", hidden: true },
      ctx(),
    );
    expect(vis.validation).toEqual({ ok: true });
    expect(vis.overlayProposal!.propsDiff).toEqual({ "presentation.hidden": true });

    const copy = runSitePatchPipeline(
      spec,
      { kind: "SET_PRESENTATION_COPY", pageSlug: "home", sectionId: "home:Hero:0", heading: "New heading" },
      ctx(),
    );
    expect(copy.validation).toEqual({ ok: true });
    expect(copy.overlayProposal!.propsDiff).toEqual({ "presentation.heading": "New heading" });
  });
});
