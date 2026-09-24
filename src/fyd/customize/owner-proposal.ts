/**
 * LANE-OWNER: typed owner proposals with preview -> approve -> apply ->
 * replay semantics.
 *
 * A compiled OwnerIntent becomes an OwnerProposal: a typed, digest-bound,
 * human-reviewable record of exactly what the owner asked for. Proposals
 * are DATA, never direct DOM edits and never silent mutations:
 *
 *   compile (./owner-command-compiler.ts)
 *     -> draft   : intent + current state -> OwnerProposal with a
 *                  before/after preview. Nothing is applied.
 *     -> approve : a capability verdict gates the proposal. The wrong
 *                  capability, a denied verdict, or a tampered proposal
 *                  body is a refusal, never an apply.
 *     -> apply   : pure state transition. Approved proposals only.
 *                  Idempotent: applying the same proposal twice is a no-op.
 *     -> replay  : the approved journal re-applies over a FRESH base
 *                  (post-regeneration). Deterministic: the same journal
 *                  over the same base always yields the same state.
 *
 * Proposal kinds:
 *   sitespec_patch   presentation change over the compiled SiteSpec. The
 *                    four classic kinds reuse the Lane D digest-bound
 *                    SitePatchBody (./propose.ts); promote_action carries
 *                    an OwnerSiteIntent applied by this layer's overlay
 *                    (a patch proposal to promote it into the canonical
 *                    SiteIntent lives in the patches directory).
 *   visibility_change per-fact public/hidden decisions (owner-overridable
 *                    within the safety bounds of ../owner-mode/
 *                    visibility-policy.ts).
 *   fact_correction   a CONFIRM / CORRECT / HIDE OwnerAssertion
 *                    (../owner-mode/corrections.ts).
 *
 * Pure except for the injectable clock. Browser-safe.
 */

import {
  applySitePatch,
  proposalDigest,
  type SiteIntent,
  type SitePatchBody,
} from "../proceduralize/patch";
import {
  assertCorrection,
  type OwnerAssertion,
} from "../owner-mode/corrections";
import {
  DEMO_OWNER_LABEL,
  canonicalJson,
  demoProvenance,
  shortId,
  type OwnerProvenance,
} from "../owner-mode/provenance";
import {
  factIdFor,
  factLabel,
  type FactRef,
  type SiteFact,
} from "../owner-mode/facts";
import {
  resolveFactVisibility,
  setFactVisibility,
  type FactVisibility,
  type VisibilityDecision,
} from "../owner-mode/visibility-policy";
import {
  type CapabilityVerdict,
  type OwnerCapability,
} from "../owner-mode/capability";
import {
  classicIntentOf,
  compileOwnerCommand,
  normalizeFieldName,
  resolveNamedFact,
  sectionContainingObject,
  type OwnerIntent,
} from "./owner-command-compiler";
import { resolveCustomizationIntent } from "./intent";
import { proposeFromSiteIntent, specDigestOf } from "./propose";
import { sha256Hex } from "../proceduralize/sha256";
import type { FYDSiteSpec, ObjectGraph } from "../sitespec/types";

/** The three typed proposal kinds. One command compiles to exactly one. */
export type OwnerProposalKind =
  | "sitespec_patch"
  | "visibility_change"
  | "fact_correction";

/**
 * Site-level intents this layer can apply. The four classic SiteIntent
 * kinds flow through the Lane D machinery; promote_action is the lane's
 * new presentation intent (action prominence), applied by the overlay in
 * applyOwnerProposal until the canonical SiteIntent gains the kind.
 */
export type OwnerSiteIntent =
  | SiteIntent
  | {
      kind: "promote_action";
      pageSlug: string;
      sectionId: string;
      objectId: string;
      action: string;
    };

export interface VisibilityChange {
  factId: string;
  visibility: FactVisibility;
  /** Human label for the preview card, e.g. "Downtown Shop : street address". */
  factLabel: string;
}

/** The before/after preview the owner reviews. Plain words, no jargon. */
export interface ProposalPreview {
  title: string;
  before: string[];
  after: string[];
}

export type ProposalStatus = "drafted" | "approved" | "applied";

export interface ProposalApproval {
  approvedBy: string;
  approvedAt: string;
  /** "DEMO OWNER MODE - not real authentication" marker. */
  note: string;
  capability: OwnerCapability;
}

export interface OwnerProposal {
  /** Deterministic: "op-" + sha256 of the canonical drafted body. */
  proposalId: string;
  kind: OwnerProposalKind;
  /** The exact command text this proposal answers. */
  commandText: string;
  intent: OwnerIntent;
  /** Classic kinds: the resolved Lane D intent. */
  siteIntent?: SiteIntent;
  /** Classic kinds: the digest-bound patch body. */
  patchBody?: SitePatchBody;
  /** promote_action and future lane intents. */
  ownerSiteIntent?: OwnerSiteIntent;
  visibilityChanges?: VisibilityChange[];
  correction?: OwnerAssertion;
  /** Digest of the base state the proposal was drafted against. */
  baseDigest: string;
  preview: ProposalPreview;
  status: ProposalStatus;
  approval?: ProposalApproval;
}

/** One ranked action-prominence record: the promote_action overlay. */
export interface ActionProminence {
  objectId: string;
  action: string;
  rank: "primary";
  proposalId: string;
}

/** The owner state proposals apply to. Everything is append-only. */
export interface OwnerSiteState {
  spec: FYDSiteSpec;
  visibilityDecisions: VisibilityDecision[];
  assertions: OwnerAssertion[];
  actionProminence: ActionProminence[];
  appliedProposalIds: string[];
}

export function emptyOwnerSiteState(spec: FYDSiteSpec): OwnerSiteState {
  return {
    spec: JSON.parse(JSON.stringify(spec)) as FYDSiteSpec,
    visibilityDecisions: [],
    assertions: [],
    actionProminence: [],
    appliedProposalIds: [],
  };
}

/** Deterministic digest of the whole owner state, for replay tests. */
export function ownerStateDigest(state: OwnerSiteState): string {
  return sha256Hex(canonicalJson(state));
}

export interface DraftContext {
  spec: FYDSiteSpec;
  graph: ObjectGraph;
  facts: SiteFact[];
  decisions: VisibilityDecision[];
  assertions: OwnerAssertion[];
  /** The fact the owner is currently looking at; binds "this". */
  currentFactRef?: FactRef;
  nowIso?: () => string;
}

export type DraftOutcome =
  | { ok: true; proposal: OwnerProposal }
  | { ok: false; reason: string };

function nowOf(ctx: DraftContext): () => string {
  return ctx.nowIso ?? (() => new Date().toISOString());
}

function objectTitles(graph: ObjectGraph): Map<string, string> {
  return new Map(graph.objects.map((o) => [o.id, o.title] as const));
}

function labelOf(ctx: DraftContext, fact: SiteFact): string {
  return factLabel(objectTitles(ctx.graph), fact);
}

function draftShell(
  kind: OwnerProposalKind,
  commandText: string,
  intent: OwnerIntent,
  baseDigest: string,
  preview: ProposalPreview,
): Omit<OwnerProposal, "proposalId"> {
  return {
    kind,
    commandText,
    intent,
    baseDigest,
    preview,
    status: "drafted",
  };
}

function finalize(shell: Omit<OwnerProposal, "proposalId">): OwnerProposal {
  // The id covers the drafted body only: status and approval are assigned
  // after drafting, so the same draft always yields the same id.
  const { status, approval, ...draftBody } = shell;
  void status;
  void approval;
  return {
    ...shell,
    proposalId: shortId("op-", canonicalJson(draftBody)),
  };
}

// ---------------------------------------------------------------------------
// Drafting: intent + current state -> proposal with preview.
// ---------------------------------------------------------------------------

function draftClassic(
  commandText: string,
  intent: OwnerIntent,
  ctx: DraftContext,
): DraftOutcome {
  const parsed = classicIntentOf(intent);
  if (!parsed) return { ok: false, reason: "Not a classic intent." };
  const resolved = resolveCustomizationIntent(ctx.spec, ctx.graph, parsed);
  if (!resolved.resolved) return { ok: false, reason: resolved.reason };
  const proposed = proposeFromSiteIntent(ctx.spec, resolved.siteIntent);
  if (!proposed.ok || !proposed.proposal) {
    return { ok: false, reason: proposed.error };
  }
  const shell = draftShell(
    "sitespec_patch",
    commandText,
    intent,
    proposed.specDigest,
    {
      title: proposed.reviewCard.title,
      before: proposed.reviewCard.before,
      after: proposed.reviewCard.after,
    },
  );
  shell.siteIntent = resolved.siteIntent;
  shell.patchBody = proposed.proposal;
  return { ok: true, proposal: finalize(shell) };
}

function draftPromoteAction(
  commandText: string,
  intent: Extract<OwnerIntent, { kind: "promote_action" }>,
  ctx: DraftContext,
): DraftOutcome {
  const t = normalizeFieldName(intent.target);
  const cands = ctx.facts
    .filter(
      (f) =>
        f.objectId === ctx.spec.ownerObjectId &&
        normalizeFieldName(f.field).includes(t),
    )
    .sort((a, b) => (a.factId < b.factId ? -1 : 1));
  if (cands.length === 0) {
    return {
      ok: false,
      reason:
        'No "' +
        intent.target +
        '" contact detail exists in this site\'s evidence, so there is ' +
        "no action to make prominent. Nothing was changed or reinterpreted.",
    };
  }
  const fact = cands[0];
  const sec = sectionContainingObject(ctx.spec, ctx.graph, fact.objectId);
  if (!sec) {
    return {
      ok: false,
      reason:
        "The " +
        intent.target +
        " detail exists but is not shown in any section, so its action " +
        "cannot be made prominent.",
    };
  }
  const ownerSiteIntent: OwnerSiteIntent = {
    kind: "promote_action",
    pageSlug: sec.pageSlug,
    sectionId: sec.sectionId,
    objectId: fact.objectId,
    action: intent.target,
  };
  const shell = draftShell(
    "sitespec_patch",
    commandText,
    intent,
    specDigestOf(ctx.spec),
    {
      title: "Make the " + intent.target + " action more prominent",
      before: [
        labelOf(ctx, fact) + ": " + intent.target + " action has standard placement",
      ],
      after: [
        labelOf(ctx, fact) +
          ": " +
          intent.target +
          " action is the primary action in the " +
          sec.component +
          " section",
      ],
    },
  );
  shell.ownerSiteIntent = ownerSiteIntent;
  return { ok: true, proposal: finalize(shell) };
}

function factsDigest(facts: SiteFact[]): string {
  return sha256Hex(canonicalJson(facts.map((f) => f.factId)));
}

function draftShowLocations(
  commandText: string,
  intent: OwnerIntent,
  ctx: DraftContext,
): DraftOutcome {
  // "Locations" are location facts on location objects (not the business
  // object's own address: "my street address" is a separate command).
  // Deterministic rule: hidden location facts first (fact-level show);
  // else a hidden locations section (section-level show); else honest no-op.
  const hidden = ctx.facts
    .filter(
      (f) =>
        f.kind === "location" &&
        f.objectId !== ctx.spec.ownerObjectId &&
        resolveFactVisibility(f, ctx.decisions, ctx.assertions).visibility ===
          "hidden",
    )
    .sort((a, b) => (a.factId < b.factId ? -1 : 1));
  if (hidden.length > 0) {
    const changes: VisibilityChange[] = hidden.map((f) => ({
      factId: f.factId,
      visibility: "public" as FactVisibility,
      factLabel: labelOf(ctx, f),
    }));
    const shell = draftShell(
      "visibility_change",
      commandText,
      intent,
      factsDigest(ctx.facts),
      {
        title:
          "Show " + hidden.length + (hidden.length === 1 ? " location" : " locations"),
        before: changes.map((c) => c.factLabel + ": hidden"),
        after: changes.map((c) => c.factLabel + ": shown"),
      },
    );
    shell.visibilityChanges = changes;
    return { ok: true, proposal: finalize(shell) };
  }
  const locSection = ((): {
    pageSlug: string;
    sectionId: string;
    hidden: boolean;
  } | null => {
    for (const p of ctx.spec.pages) {
      for (const s of p.sections) {
        if (
          /location/i.test(s.component) ||
          /location/i.test(s.presentation.heading ?? "")
        ) {
          return {
            pageSlug: p.slug,
            sectionId: s.id,
            hidden: s.presentation.hidden === true,
          };
        }
      }
    }
    return null;
  })();
  if (locSection && locSection.hidden) {
    const siteIntent: SiteIntent = {
      kind: "toggle_section",
      pageSlug: locSection.pageSlug,
      sectionId: locSection.sectionId,
      hidden: false,
    };
    const proposed = proposeFromSiteIntent(ctx.spec, siteIntent);
    if (!proposed.ok || !proposed.proposal) {
      return { ok: false, reason: proposed.error };
    }
    const shell = draftShell(
      "sitespec_patch",
      commandText,
      intent,
      proposed.specDigest,
      {
        title: proposed.reviewCard.title,
        before: proposed.reviewCard.before,
        after: proposed.reviewCard.after,
      },
    );
    shell.siteIntent = siteIntent;
    shell.patchBody = proposed.proposal;
    return { ok: true, proposal: finalize(shell) };
  }
  return {
    ok: false,
    reason:
      "Both locations are already shown: no location fact is hidden and no " +
      "locations section is hidden, so there is nothing to change.",
  };
}

function draftFactVisibility(
  commandText: string,
  intent: Extract<OwnerIntent, { kind: "hide_fact" | "show_fact" }>,
  ctx: DraftContext,
): DraftOutcome {
  // "my X" phrasing means the owner's own object: prefer its fact when
  // several objects share the field name.
  const resolved = resolveNamedFact(
    ctx.facts,
    intent.target,
    ctx.spec.ownerObjectId,
  );
  if (!resolved.fact) {
    const fields = resolved.candidates
      .map((c) => c.field)
      .filter((v, i, a) => a.indexOf(v) === i);
    if (resolved.candidates.length > 1) {
      return {
        ok: false,
        reason:
          'The name "' + intent.target + '" is ambiguous: it matches ' +
          resolved.candidates.length +
          " facts across different objects (" +
          fields.join(", ") +
          "). Say which one you mean, for example by naming the object.",
      };
    }
    const hint =
      fields.length > 0 ? " Did you mean: " + fields.join(", ") + "?" : "";
    return {
      ok: false,
      reason:
        'No fact named "' +
        intent.target +
        "\" exists in this site's evidence." +
        hint,
    };
  }
  const fact = resolved.fact;
  const visibility: FactVisibility = intent.kind === "hide_fact" ? "hidden" : "public";
  if (visibility === "hidden" && fact.kind === "identity") {
    return {
      ok: false,
      reason:
        "Safety bound: the business name is an identity fact and cannot be " +
        "hidden from the public site.",
    };
  }
  const current = resolveFactVisibility(fact, ctx.decisions, ctx.assertions);
  if (current.visibility === visibility) {
    return {
      ok: false,
      reason:
        labelOf(ctx, fact) +
        " is already " +
        (visibility === "hidden" ? "hidden" : "shown") +
        ", so there is nothing to change.",
    };
  }
  const verb = visibility === "hidden" ? "Hide" : "Show";
  const shell = draftShell(
    "visibility_change",
    commandText,
    intent,
    factsDigest(ctx.facts),
    {
      title: verb + " " + intent.target,
      before: [labelOf(ctx, fact) + ": " + current.visibility],
      after: [labelOf(ctx, fact) + ": " + visibility],
    },
  );
  shell.visibilityChanges = [
    { factId: fact.factId, visibility, factLabel: labelOf(ctx, fact) },
  ];
  return { ok: true, proposal: finalize(shell) };
}

function draftRemoveSocialLink(
  commandText: string,
  intent: Extract<OwnerIntent, { kind: "remove_social_link" }>,
  ctx: DraftContext,
): DraftOutcome {
  let fact: SiteFact | null = null;
  if (ctx.currentFactRef) {
    const r = ctx.currentFactRef;
    const id = factIdFor(r.objectId, r.field, r.index ?? 0);
    const f = ctx.facts.find((x) => x.factId === id);
    if (f && f.kind === "social") fact = f;
  }
  if (!fact) {
    const socials = ctx.facts
      .filter((f) => f.kind === "social")
      .sort((a, b) => (a.factId < b.factId ? -1 : 1));
    if (socials.length === 1) fact = socials[0];
  }
  if (!fact) {
    return {
      ok: false,
      reason:
        '"Remove this social link" needs one link to remove: ' +
        (intent.deictic
          ? "no link is currently selected, and this site has " +
            ctx.facts.filter((f) => f.kind === "social").length +
            " social links. Select one link first, then ask again."
          : 'no social link matching "' + intent.target + '" was found.'),
    };
  }
  const assertion = assertCorrection({
    factRef: { objectId: fact.objectId, field: fact.field, index: fact.index },
    op: "HIDE",
    provenance: demoProvenance(null, nowOf(ctx)),
    sourceValueSeen: fact.value,
  });
  const shell = draftShell(
    "fact_correction",
    commandText,
    intent,
    factsDigest(ctx.facts),
    {
      title: "Remove social link",
      before: [labelOf(ctx, fact) + ": shown (" + fact.value + ")"],
      after: [labelOf(ctx, fact) + ": hidden"],
    },
  );
  shell.correction = assertion;
  return { ok: true, proposal: finalize(shell) };
}

/**
 * Draft the typed proposal for a compiled intent against the current
 * state. Nothing is applied; the proposal carries its before/after
 * preview for owner review.
 */
export function draftOwnerProposal(
  commandText: string,
  intent: OwnerIntent,
  ctx: DraftContext,
): DraftOutcome {
  switch (intent.kind) {
    case "promote_first":
    case "hide_section":
    case "show_section":
    case "feature_object":
      return draftClassic(commandText, intent, ctx);
    case "promote_action":
      return draftPromoteAction(commandText, intent, ctx);
    case "show_locations":
      return draftShowLocations(commandText, intent, ctx);
    case "hide_fact":
    case "show_fact":
      return draftFactVisibility(commandText, intent, ctx);
    case "remove_social_link":
      return draftRemoveSocialLink(commandText, intent, ctx);
  }
}

// ---------------------------------------------------------------------------
// Approval: capability-gated, digest-verified.
// ---------------------------------------------------------------------------

const REQUIRED_CAPABILITY: Record<OwnerProposalKind, OwnerCapability> = {
  sitespec_patch: "owner.customize-approve",
  visibility_change: "owner.edit-visibility",
  fact_correction: "owner.correct-fact",
};

/** Which owner capability gates approval of a proposal kind. */
export function requiredCapabilityFor(kind: OwnerProposalKind): OwnerCapability {
  return REQUIRED_CAPABILITY[kind];
}

export type ApproveOutcome =
  | { ok: true; proposal: OwnerProposal }
  | { ok: false; reason: string };

function digestOfPatchBody(body: SitePatchBody): string {
  const { proposalDigest: _drop, ...rest } = body;
  void _drop;
  return proposalDigest(rest as Omit<SitePatchBody, "proposalDigest">);
}

/**
 * Approve a drafted proposal. The caller supplies the capability verdict
 * (see ../owner-mode/capability.ts); this function checks it BEFORE doing
 * anything else, then re-verifies the proposal body's own digest so a
 * tampered proposal can never be approved.
 */
export function approveOwnerProposal(
  proposal: OwnerProposal,
  verdict: CapabilityVerdict,
  nowIso: () => string = () => new Date().toISOString(),
): ApproveOutcome {
  if (proposal.status !== "drafted") {
    return {
      ok: false,
      reason:
        "Proposal " +
        proposal.proposalId +
        " is " +
        proposal.status +
        ", not drafted; only drafted proposals can be approved.",
    };
  }
  const required = REQUIRED_CAPABILITY[proposal.kind];
  if (verdict.capability !== required) {
    return {
      ok: false,
      reason:
        "Wrong capability for this proposal: " +
        proposal.kind +
        " requires '" +
        required +
        "', got '" +
        verdict.capability +
        "'.",
    };
  }
  if (!verdict.allowed) {
    return {
      ok: false,
      reason: "Capability denied: " + verdict.reason,
    };
  }
  if (proposal.patchBody) {
    if (digestOfPatchBody(proposal.patchBody) !== proposal.patchBody.proposalDigest) {
      return {
        ok: false,
        reason:
          "Proposal body digest does not verify; the proposal may have been " +
          "tampered with. Refusing to approve.",
      };
    }
  }
  return {
    ok: true,
    proposal: {
      ...proposal,
      status: "approved",
      approval: {
        approvedBy: DEMO_OWNER_LABEL,
        approvedAt: nowIso(),
        note: "DEMO OWNER MODE - not real authentication. No identity was verified.",
        capability: required,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Apply: pure state transition. Replay: fold the journal over a fresh base.
// ---------------------------------------------------------------------------

export type ApplyOutcome =
  | { ok: true; state: OwnerSiteState; summary: string }
  | { ok: false; reason: string };

function provenanceFromApproval(
  approval: ProposalApproval,
  supersedes: string | null = null,
): OwnerProvenance {
  return {
    owner: approval.approvedBy,
    assertedAt: approval.approvedAt,
    supersedes,
  };
}

/**
 * Apply one approved proposal to the owner state. Pure: returns a new
 * state, never mutates inputs. Idempotent: re-applying an applied
 * proposalId is a no-op.
 */
export function applyOwnerProposal(
  state: OwnerSiteState,
  proposal: OwnerProposal,
): ApplyOutcome {
  if (proposal.status !== "approved" || !proposal.approval) {
    return {
      ok: false,
      reason:
        "Proposal " +
        proposal.proposalId +
        " must be approved before apply; refusing to apply a " +
        proposal.status +
        " proposal.",
    };
  }
  if (state.appliedProposalIds.includes(proposal.proposalId)) {
    return { ok: true, state, summary: "already applied (idempotent no-op)" };
  }
  const approval = proposal.approval;
  const provenance = provenanceFromApproval(approval);
  const markApplied = (s: OwnerSiteState): OwnerSiteState => ({
    ...s,
    appliedProposalIds: [...s.appliedProposalIds, proposal.proposalId],
  });

  switch (proposal.kind) {
    case "sitespec_patch": {
      if (proposal.patchBody) {
        const spec = applySitePatch(state.spec, proposal.patchBody);
        return {
          ok: true,
          state: markApplied({ ...state, spec }),
          summary: "applied site patch: " + proposal.preview.title,
        };
      }
      if (proposal.ownerSiteIntent && proposal.ownerSiteIntent.kind === "promote_action") {
        const rec: ActionProminence = {
          objectId: proposal.ownerSiteIntent.objectId,
          action: proposal.ownerSiteIntent.action,
          rank: "primary",
          proposalId: proposal.proposalId,
        };
        const rest = state.actionProminence.filter(
          (r) => !(r.objectId === rec.objectId && r.action === rec.action),
        );
        return {
          ok: true,
          state: markApplied({ ...state, actionProminence: [...rest, rec] }),
          summary: "applied action prominence: " + proposal.preview.title,
        };
      }
      return { ok: false, reason: "sitespec_patch proposal carries no patch body or owner intent." };
    }
    case "visibility_change": {
      let decisions = state.visibilityDecisions;
      for (const change of proposal.visibilityChanges ?? []) {
        decisions = [...decisions, { factId: change.factId, visibility: change.visibility, provenance }];
      }
      return {
        ok: true,
        state: markApplied({ ...state, visibilityDecisions: decisions }),
        summary:
          "applied visibility: " + (proposal.visibilityChanges ?? []).length + " fact(s)",
      };
    }
    case "fact_correction": {
      if (!proposal.correction) {
        return { ok: false, reason: "fact_correction proposal carries no assertion." };
      }
      const exists = state.assertions.some(
        (a) => a.assertionId === proposal.correction!.assertionId,
      );
      const assertions = exists
        ? state.assertions
        : [...state.assertions, proposal.correction];
      return {
        ok: true,
        state: markApplied({ ...state, assertions }),
        summary: "recorded owner assertion (" + proposal.correction.op + ")",
      };
    }
  }
}

export interface ReplayResult {
  state: OwnerSiteState;
  replayed: number;
  skipped: number;
}

/**
 * Replay the approved journal over a FRESH base state (post-regeneration).
 * Deterministic: same journal + same base -> same state, every time.
 * Entries that were never approved are skipped and counted, never applied.
 * Entries marked "applied" replay like "approved" ones: they were approved
 * before they were applied.
 */
export function replayOwnerJournal(
  base: OwnerSiteState,
  journal: OwnerProposal[],
): ReplayResult {
  let state = base;
  let replayed = 0;
  let skipped = 0;
  for (const proposal of journal) {
    if (
      (proposal.status !== "approved" && proposal.status !== "applied") ||
      !proposal.approval
    ) {
      skipped += 1;
      continue;
    }
    const out = applyOwnerProposal(state, { ...proposal, status: "approved" });
    if (!out.ok) {
      skipped += 1;
      continue;
    }
    state = out.state;
    replayed += 1;
  }
  return { state, replayed, skipped };
}

/**
 * Convenience: the full loop for one command. Compiles, drafts, approves
 * (against the supplied verdict), and applies. Each stage can refuse
 * honestly; the first refusal stops the loop with its reason.
 */
export function runOwnerCommand(
  text: string,
  state: OwnerSiteState,
  draftCtx: DraftContext,
  verdict: CapabilityVerdict,
  nowIso?: () => string,
): ApplyOutcome | { ok: false; reason: string } {
  const now = nowIso ?? (() => new Date().toISOString());
  const ctx: DraftContext = { ...draftCtx, nowIso: now };
  const compiled = compileOwnerCommand(text);
  if (!compiled.ok) return compiled;
  const drafted = draftOwnerProposal(text, compiled.intent, ctx);
  if (!drafted.ok) return drafted;
  const approved = approveOwnerProposal(drafted.proposal, verdict, now);
  if (!approved.ok) return approved;
  return applyOwnerProposal(state, { ...approved.proposal, status: "approved" });
}

export { setFactVisibility };
export type { OwnerProvenance };
