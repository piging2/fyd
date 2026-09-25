/**
 * TRACK E: conversational customization end-to-end, pinned to Nolan's
 * EXACT scenario on Coppersmith.
 *
 * Owner says: "Move emergency plumbing first"
 *
 * Live pre-state (2026-09-25): the served projection carries an approved
 * presentation-intent directive (pi-2e120da637f2d826) that puts Ventilation
 * first in Services. The Coppersmith graph carries NO "Emergency Plumbing"
 * object (services: Plumbing, Heating & Cooling, HVAC, Ventilation), so
 * "emergency plumbing" deterministically grounds to the "Plumbing" object
 * via word containment, and Plumbing is NOT first in the pre-state, so the
 * exact command is a REAL change.
 *
 *   NATURAL LANGUAGE
 *     -> compileOwnerCommand -> typed OwnerIntent {promote_first, "emergency plumbing"}
 *   TYPED PATCH
 *     -> resolveCustomizationIntent -> typed SiteIntent (reorder_object, Plumbing)
 *     -> proposeFromSiteIntent -> digest-bound SitePatch proposal + review card (preview)
 *   PROJECTION UPDATE + APPROVAL (consequence tier)
 *     -> the reorder is a presentation-intent (LOW consequence: reversible,
 *        one-step undo, "Change the website"); the approved directive is
 *        persisted with demo-owner approval lineage (NEVER a fact mutation:
 *        the object graph is untouched).
 *   REGENERATION SAFETY
 *     -> fresh generateSiteSpec (re-observe / re-compile) +
 *        applyPresentationIntent (replay both directives) -> Plumbing stays
 *        first; the graph is byte-identical to before.
 *
 * Run with: npx jest --config src/fyd/customize/jest.config.cjs conversational-customization-e2e
 */

import { getPingObjectGraphSync } from "@/fyd/data/ping-object-source";
import { generateSiteSpec } from "@/fyd/proceduralize/generator";
import { applySitePatch } from "@/fyd/proceduralize/patch";
import { resolveQuery, applyObjectOrder } from "@/fyd/components/renderer";
import {
  compileOwnerCommand,
  classicIntentOf,
} from "../owner-command-compiler";
import {
  parseCustomizationIntent,
  resolveCustomizationIntent,
} from "../intent";
import { isUnsupported } from "../types";
import { proposeFromSiteIntent } from "../propose";
import { applyPresentationIntent } from "../apply-layer";
import { buildDirective } from "../server";
import type {
  PresentationIntentBlock,
  SetPresentationIntentOp,
} from "../types";
import type { FYDSiteSpec, ObjectGraph } from "@/fyd/sitespec/types";

const SITE_ID = "coppersmith-plumbing";
const EXACT_COMMAND = "Move emergency plumbing first";

function loadBase(): { graph: ObjectGraph; spec: FYDSiteSpec } {
  const { graph, meta } = getPingObjectGraphSync(SITE_ID);
  const spec = generateSiteSpec(graph, {
    generatedAt: meta.generatedAt,
    siteId: SITE_ID,
  });
  return { graph, spec };
}

function servicesOrder(spec: FYDSiteSpec, graph: ObjectGraph): string[] {
  const page = spec.pages.find((p) => p.slug === "home")!;
  const section = page.sections.find((s) => s.component === "Services")!;
  const resolved = resolveQuery(section.query, graph, spec.ownerObjectId);
  return applyObjectOrder(resolved, section.presentation.objectOrder).map(
    (o) => o.title,
  );
}

function toBlockDirective(op: SetPresentationIntentOp) {
  return {
    intentId: op.intentId,
    siteIntent: op.siteIntent,
    proposal: op.proposal,
    approval: {
      proposalDigest: op.approval.proposalDigest,
      approvedBy: op.approval.approvedBy,
      approvedAt: op.approval.approvedAt,
      note: op.approval.note,
    },
  };
}

/** Build an approved "Ventilation first" directive off the raw base spec. */
function ventilationDirective(graph: ObjectGraph, spec: FYDSiteSpec) {
  const classic = classicIntentOf({
    kind: "promote_first",
    target: "ventilation",
  })!;
  const resolved = resolveCustomizationIntent(spec, graph, classic);
  if (!resolved.resolved) throw new Error("ventilation should resolve");
  const proposed = proposeFromSiteIntent(spec, resolved.siteIntent, graph);
  if (!proposed.ok) throw new Error("ventilation proposal should be ok");
  return buildDirective(
    SITE_ID,
    resolved.siteIntent,
    proposed.proposal,
    "2026-09-24T15:36:22.367Z",
  );
}

/**
 * The live pre-state: raw base + the approved Ventilation-first
 * presentation intent (mirrors the served projection after directive
 * pi-2e120da637f2d826).
 */
function loadPreState(): {
  graph: ObjectGraph;
  spec: FYDSiteSpec;
  ventilationBlock: PresentationIntentBlock;
  ventilationOp: SetPresentationIntentOp;
} {
  const { graph, spec } = loadBase();
  const ventilationOp = ventilationDirective(graph, spec);
  const ventilationBlock: PresentationIntentBlock = {
    directives: [toBlockDirective(ventilationOp)],
    provenance: {
      kind: "owner-presentation-intent",
      note: "pre-state: Ventilation first (mirrors pi-2e120da637f2d826)",
      eventIds: [],
    },
  };
  const layered = applyPresentationIntent(spec, ventilationBlock, graph);
  return { graph, spec: layered.spec, ventilationBlock, ventilationOp };
}

describe("pinned scenario: 'Move emergency plumbing first' on Coppersmith", () => {
  test("pre-state: Ventilation is first (approved presentation intent, not the raw base)", () => {
    const { spec, graph } = loadPreState();
    expect(servicesOrder(spec, graph)[0]).toBe("Ventilation");
  });

  test("NL compiles to the typed promote_first intent", () => {
    const outcome = compileOwnerCommand(EXACT_COMMAND);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) throw new Error("unreachable");
    expect(outcome.intent).toEqual({
      kind: "promote_first",
      target: "emergency plumbing",
    });
  });

  test("resolution: 'emergency plumbing' grounds to Plumbing; real reorder produced", () => {
    const { spec, graph } = loadPreState();
    const parsed = parseCustomizationIntent(EXACT_COMMAND);
    expect(isUnsupported(parsed)).toBe(false);
    if (isUnsupported(parsed)) throw new Error("unreachable");
    const classic = classicIntentOf({
      kind: "promote_first",
      target: "emergency plumbing",
    })!;
    const resolved = resolveCustomizationIntent(spec, graph, classic);
    // No "Emergency Plumbing" object exists; the phrase grounds to the
    // "Plumbing" object via word containment, and Plumbing is NOT first
    // in the Ventilation-first pre-state, so this is a real change.
    expect(resolved.resolved).toBe(true);
    if (!resolved.resolved) throw new Error("unreachable");
    expect(resolved.siteIntent.kind).toBe("reorder_object");
    expect(resolved.resolutionNote).toMatch(/Plumbing/);
  });

  test("typed SitePatch: digest-bound proposal with before/after preview", () => {
    const { spec, graph } = loadPreState();
    const classic = classicIntentOf({
      kind: "promote_first",
      target: "emergency plumbing",
    })!;
    const resolved = resolveCustomizationIntent(spec, graph, classic);
    if (!resolved.resolved) throw new Error("unreachable");

    const proposed = proposeFromSiteIntent(spec, resolved.siteIntent, graph);
    expect(proposed.ok).toBe(true);
    if (!proposed.ok) throw new Error("unreachable");
    // The proposal is a typed SitePatch bound to the exact spec digest it
    // was drafted against; the review card is the preview (before/after).
    expect(proposed.proposal.proposalDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(proposed.reviewCard.title).toMatch(/Reorder objects/);
    expect(proposed.reviewCard.before[0]).toMatch(
      /^Objects in Services: Ventilation, /,
    );
    expect(proposed.reviewCard.after[0]).toMatch(
      /^Objects in Services: Plumbing, /,
    );
    expect(proposed.specDigest).toBeTruthy();
  });

  test("projection update: Plumbing moves first; graph facts untouched", () => {
    const { spec, graph } = loadPreState();
    const graphBefore = JSON.stringify(graph.objects);
    const classic = classicIntentOf({
      kind: "promote_first",
      target: "emergency plumbing",
    })!;
    const resolved = resolveCustomizationIntent(spec, graph, classic);
    if (!resolved.resolved) throw new Error("unreachable");
    const proposed = proposeFromSiteIntent(spec, resolved.siteIntent, graph);
    if (!proposed.ok) throw new Error("unreachable");

    const updated = applySitePatch(spec, proposed.proposal);
    expect(servicesOrder(updated, graph)[0]).toBe("Plumbing");
    // LOW consequence: presentation only. No object fact changed.
    expect(JSON.stringify(graph.objects)).toBe(graphBefore);
  });

  test("approval: LOW consequence, demo-owner lineage, deterministic id", () => {
    const { spec, graph } = loadPreState();
    const classic = classicIntentOf({
      kind: "promote_first",
      target: "emergency plumbing",
    })!;
    const resolved = resolveCustomizationIntent(spec, graph, classic);
    if (!resolved.resolved) throw new Error("unreachable");
    const proposed = proposeFromSiteIntent(spec, resolved.siteIntent, graph);
    if (!proposed.ok) throw new Error("unreachable");

    const op = buildDirective(
      SITE_ID,
      resolved.siteIntent,
      proposed.proposal,
      "2026-09-25T15:41:06.209Z",
    );
    expect(op.op).toBe("set_presentation_intent");
    expect(op.intentId).toMatch(/^pi-[0-9a-f]{16}$/);
    expect(op.approval.approvedBy).toBe("demo-owner (seeded, unverified)");
    expect(op.approval.note).toMatch(/DEMO OWNER MODE/);
    // The directive is presentation intent, never a fact write.
    expect(op.siteIntent.kind).toBe("reorder_object");
  });

  test("regeneration safety: fresh recompile + intent replay keeps Plumbing first; undo restores Ventilation-first", () => {
    const { graph, ventilationBlock } = loadPreState();
    const base0 = loadBase().spec;

    // Build the approved Plumbing-first directive off the pre-state.
    const pre = loadPreState();
    const classic = classicIntentOf({
      kind: "promote_first",
      target: "emergency plumbing",
    })!;
    const resolved = resolveCustomizationIntent(pre.spec, graph, classic);
    if (!resolved.resolved) throw new Error("unreachable");
    const proposed = proposeFromSiteIntent(pre.spec, resolved.siteIntent, graph);
    if (!proposed.ok) throw new Error("unreachable");
    const plumbingOp = buildDirective(
      SITE_ID,
      resolved.siteIntent,
      proposed.proposal,
      "2026-09-25T15:41:06.209Z",
    );

    const bothBlock: PresentationIntentBlock = {
      directives: [
        ...ventilationBlock.directives,
        toBlockDirective(plumbingOp),
      ],
      provenance: {
        kind: "owner-presentation-intent",
        note: "test",
        eventIds: [],
      },
    };

    // REGENERATION: re-observe (fresh base compile from the same graph),
    // then re-apply the persisted intent layer. This is exactly what
    // compilePublicSite does on every render after the journal persists
    // the directives.
    const graphBefore = JSON.stringify(graph.objects);
    const regenBase = loadBase().spec;
    const layered = applyPresentationIntent(regenBase, bothBlock, graph);
    expect(layered.applied.map((a) => a.intentId)).toContain(
      plumbingOp.intentId,
    );
    expect(servicesOrder(layered.spec, graph)[0]).toBe("Plumbing");
    // Facts byte-identical through regeneration.
    expect(JSON.stringify(graph.objects)).toBe(graphBefore);

    // UNDO (LOW tier): drop the Plumbing directive, regenerate ->
    // Ventilation-first pre-state restored, never the raw base.
    const undone = applyPresentationIntent(
      regenBase,
      ventilationBlock,
      graph,
    );
    expect(servicesOrder(undone.spec, graph)).toEqual(
      servicesOrder(pre.spec, graph),
    );
    expect(servicesOrder(undone.spec, graph)[0]).toBe("Ventilation");
    void base0;
  });
});

describe("honesty guard: against the RAW base the exact command is a no-op refusal", () => {
  test("Plumbing is already first in the raw base; the system refuses instead of fabricating", () => {
    const { graph, spec } = loadBase();
    const titles = graph.objects.map((o) => o.title);
    expect(titles.some((t) => /emergency/i.test(t))).toBe(false);
    const classic = classicIntentOf({
      kind: "promote_first",
      target: "emergency plumbing",
    })!;
    const resolved = resolveCustomizationIntent(spec, graph, classic);
    expect(resolved.resolved).toBe(false);
    if (resolved.resolved) throw new Error("unreachable");
    expect(resolved.reason).toMatch(/already first/);
    // The system never fabricates a change: no proposal, no patch.
  });
});
