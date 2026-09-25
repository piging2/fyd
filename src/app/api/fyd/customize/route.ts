/**
 * POST /api/fyd/customize — Lane D: customize-with-FYD approval API.
 *
 * Actions:
 *   { action: "parse", siteId, text }
 *       Plain English -> typed intent -> resolution -> digest-bound
 *       proposal -> review card. No owner action, no persistence.
 *   { action: "approve", siteId, text, proposal }
 *       Re-derives the whole chain from the text against the CURRENT
 *       spec, re-verifies every digest, and only then journals the
 *       directive. DEMO OWNER MODE ONLY (localhost/private + env flag),
 *       conspicuously labeled, never real authentication.
 *   { action: "clear", siteId, intentId }
 *       Removes an approved directive from the journal (demo only).
 *
 * GET ?siteId=<id>&view=inspect — current presentation-intent state,
 *   section order, digest of the spec the owner reviews. Same
 *   demo-owner/private-host gate as the POST actions: owner
 *   presentation-intent state is a confidentiality class, never served
 *   to anonymous viewers.
 *
 * Failures are typed and honest: 400 (bad request / unsupported /
 * unresolved), 403 (no demo-owner mode, capability denied, public host),
 * 404 (site not found), 409 (stale digest — the spec moved since the
 * proposal was drafted; idempotency_conflict — request_id reused with a
 * different payload), 422 (target missing from current evidence),
 * 502 (journal unreachable — nothing was recorded),
 * 504 (unknown_outcome — the journal may have recorded it; retry with the
 * same request_id to resolve; never treat as failed).
 */

import { NextResponse } from "next/server";
import { isPrivateHost } from "@/fyd/owner-mode/gate";
import {
  DEMO_OWNER_ACTOR,
  answerAuthorization,
  demoAuthorizationQuestion,
} from "@/fyd/owner-mode/capability";
import { resolveOwnerIdentity } from "@/fyd/owner-mode/owner-identity";
import { isUnsupported } from "@/fyd/customize/types";
import {
  parseCustomizationIntent,
  resolveCustomizationIntent,
} from "@/fyd/customize/intent";
import { proposeFromSiteIntent } from "@/fyd/customize/propose";
import {
  buildDirective,
  emitOverlayEvent,
  loadCustomizedSite,
} from "@/fyd/customize/server";
import {
  canonicalPayloadDigest,
  newRequestId,
  runIdempotentWrite,
  UnknownOutcomeError,
  writeBoundaryStore,
  type DeriveResult,
  type WriteOutcome,
} from "@/fyd/customize/write-boundary";
import type { SitePatchBody } from "@/fyd/proceduralize/patch";

export const dynamic = "force-dynamic";

const NOT_REAL_AUTH =
  "DEMO OWNER MODE - not real authentication. No identity was verified; " +
  "this mode is for localhost/private-network demonstration only.";

async function demoDenied(req: Request, siteId: string, action: string) {
  const enabled = process.env.NEXT_PUBLIC_FYD_DEMO_OWNER_MODE === "1";
  const host = req.headers.get("host") ?? "";
  const privateNet = isPrivateHost(host);
  if (!enabled || !privateNet) {
    return NextResponse.json(
      {
        ok: false,
        code: "demo_owner_mode_required",
        error:
          "Customize-with-FYD approvals require DEV/DEMO OWNER MODE " +
          "(NEXT_PUBLIC_FYD_DEMO_OWNER_MODE=1) on a localhost or private-network host. " +
          NOT_REAL_AUTH,
        demoOwnerMode: enabled,
        hostPrivate: privateNet,
      },
      { status: 403 },
    );
  }
  // The typed authorization question carries the actual site resource
  // and the requested action (inspect/approve/clear). The demo authority
  // answers from the hard-coded demo relationship mapping plus the
  // capability rules; the answer is stamped as demo scaffolding with an
  // explicitly unverified identity.
  const answer = answerAuthorization(
    demoAuthorizationQuestion(
      DEMO_OWNER_ACTOR,
      siteId,
      "owner.customize-approve",
      action,
      await resolveOwnerIdentity(),
    ),
  );
  if (!answer.allowed) {
    return NextResponse.json(
      {
        ok: false,
        code: "capability_denied",
        error: "Capability denied: " + answer.reason,
        demoOwnerMode: enabled,
        demoScaffolding: answer.demoScaffolding,
        identityNote: answer.identityNote,
      },
      { status: 403 },
    );
  }
  return null;
}

interface InspectView {
  siteId: string;
  specDigest: string;
  baseSpecDigest: string;
  pageOrder: { pageSlug: string; sections: { id: string; component: string; hidden: boolean }[] }[];
  directives: {
    intentId: string;
    siteIntent: unknown;
    proposalDigest: string;
    approvedBy: string;
    approvedAt: string;
    eventId?: string;
    /**
     * Causal read-back: the exact before/after the owner approved, from the
     * same review-card describers as propose time. Null when the intent kind
     * has no presentation card.
     */
    change: {
      title: string;
      before: string[];
      after: string[];
      operationCount: number;
    } | null;
  }[];
  appliedIntentIds: string[];
  unresolved: { intentId: string; reason: string }[];
  demoOwnerMode: boolean;
  demo: true;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const siteId = (url.searchParams.get("siteId") ?? "").trim();
  const view = url.searchParams.get("view") ?? "";
  if (!siteId || view !== "inspect") {
    return NextResponse.json(
      { ok: false, error: "Usage: ?siteId=<id>&view=inspect" },
      { status: 400 },
    );
  }
  // Owner-state confidentiality class: the inspect view serves
  // presentation-intent directives (approvedBy, approvedAt, eventId) and
  // hidden-section decisions. Same gate as the POST owner actions.
  const gate = await demoDenied(req, siteId, "inspect");
  if (gate) return gate;
  try {
    const site = await loadCustomizedSite(siteId);
    const cards = new Map(
      site.applied.map((a) => [a.intentId, a.reviewCard] as const),
    );
    const body: InspectView = {
      siteId,
      specDigest: site.specDigest,
      baseSpecDigest: site.baseSpecDigest,
      pageOrder: site.spec.pages.map((p) => ({
        pageSlug: p.slug,
        sections: p.sections.map((s) => ({
          id: s.id,
          component: s.component,
          hidden: s.presentation.hidden === true,
        })),
      })),
      directives: (site.presentationIntent?.directives ?? []).map((d) => ({
        intentId: d.intentId,
        siteIntent: d.siteIntent,
        proposalDigest: d.proposal.proposalDigest,
        approvedBy: d.approval.approvedBy,
        approvedAt: d.approval.approvedAt,
        eventId: d.approval.eventId,
        // Causal read-back: proposal id + before/after + actor + timestamp
        // say what changed and why.
        change: cards.get(d.intentId) ?? null,
      })),
      appliedIntentIds: site.appliedIntentIds,
      unresolved: site.unresolved,
      demoOwnerMode: process.env.NEXT_PUBLIC_FYD_DEMO_OWNER_MODE === "1",
      demo: true,
    };
    return NextResponse.json({ ok: true, ...body });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        demo: true,
      },
      { status: 404 },
    );
  }
}

interface ActionBody {
  action?: string;
  siteId?: string;
  text?: string;
  proposal?: SitePatchBody;
  intentId?: string;
  /** Idempotency key for approve/clear. Minted server-side when absent. */
  request_id?: unknown;
}

/** Parse -> resolve -> propose. Stateless; commits nothing. */
async function handleParse(siteId: string, text: string) {
  const parsed = parseCustomizationIntent(text);
  if (isUnsupported(parsed)) {
    return NextResponse.json(
      { ok: false, code: "unsupported", error: parsed.reason, demo: true },
      { status: 400 },
    );
  }
  let site;
  try {
    site = await loadCustomizedSite(siteId);
  } catch (e) {
    return NextResponse.json(
      { ok: false, code: "site_not_found", error: e instanceof Error ? e.message : String(e), demo: true },
      { status: 404 },
    );
  }
  const resolved = resolveCustomizationIntent(site.spec, site.graph, parsed.intent);
  if (!resolved.resolved) {
    return NextResponse.json(
      {
        ok: false,
        code: "unresolved",
        error: resolved.reason,
        intent: parsed.intent,
        intentDigest: parsed.intentDigest,
        demo: true,
      },
      { status: 422 },
    );
  }
  const outcome = proposeFromSiteIntent(site.spec, resolved.siteIntent, site.graph);
  if (!outcome.ok) {
    return NextResponse.json(
      {
        ok: false,
        code: "no_op",
        error: outcome.error,
        intent: parsed.intent,
        intentDigest: parsed.intentDigest,
        demo: true,
      },
      { status: 422 },
    );
  }
  return NextResponse.json({
    ok: true,
    siteId,
    intent: parsed.intent,
    intentDigest: parsed.intentDigest,
    resolutionNote: resolved.resolutionNote,
    siteIntent: resolved.siteIntent,
    proposal: outcome.proposal,
    reviewCard: outcome.reviewCard,
    specDigest: outcome.specDigest,
    // Consequence stamping (FYD product authority directive, Nolan
    // 2026-09-25): the customize lane only handles presentation-only
    // intents (reorder, toggle, feature/reorder/deactivate, edit copy,
    // theme token), so it is always LOW: apply plus undo. Anything
    // consequential (HIGH class) is refused before a proposal exists.
    consequenceTier: "LOW",
    demo: true,
  });
}

/**
 * Approve -> apply (journal only; render picks it up on next regen).
 * Re-derives the entire chain from the text against the CURRENT spec and
 * re-verifies every digest. A stale spec, a stale digest, or an altered
 * proposal is refused — never applied.
 *
 * Write-boundary P0: the approve runs through runIdempotentWrite.
 * request_id + canonical payload digest give idempotent retries; the
 * derive -> verify -> append sequence holds the per-site lock, closing the
 * TOCTOU in the optimistic proposal check. A journal POST whose outcome is
 * unknown surfaces as 504 UNKNOWN, never as failure.
 */
interface ApproveDerived {
  siteIntent: Parameters<typeof buildDirective>[1];
  fresh: SitePatchBody;
  specDigest: string;
}

function journalFailureResponse(actionNoun: string, requestId: string, e: unknown) {
  if (e instanceof UnknownOutcomeError) {
    return unknownOutcomeResponse(actionNoun, requestId);
  }
  const msg = e instanceof Error ? e.message : String(e);
  return NextResponse.json(
    {
      ok: false,
      code: "journal_unavailable",
      error: `The ${actionNoun} was NOT recorded: ${msg}`,
      demo: true,
      requestId,
    },
    { status: 502 },
  );
}

function idempotencyConflictResponse(requestId: string) {
  return NextResponse.json(
    {
      ok: false,
      code: "idempotency_conflict",
      error:
        "This request_id was already used for a different owner action. " +
        "Retries must reuse the exact same payload; a new action needs a new request_id. " +
        "Nothing was applied.",
      demo: true,
      requestId,
    },
    { status: 409 },
  );
}

function unknownOutcomeResponse(actionNoun: string, requestId: string) {
  return NextResponse.json(
    {
      ok: false,
      code: "unknown_outcome",
      outcome: "UNKNOWN",
      error:
        "OUTCOME UNKNOWN — RECONCILIATION IN PROGRESS. The journal may have recorded " +
        `this ${actionNoun}. Retry with the same request_id to resolve; do not treat this as failed.`,
      demo: true,
      requestId,
    },
    { status: 504 },
  );
}

function rejectedResponse(failure: {
  code: string;
  error: string;
  status: number;
  extra?: Record<string, unknown>;
}) {
  return NextResponse.json(
    { ok: false, code: failure.code, error: failure.error, demo: true, ...(failure.extra ?? {}) },
    { status: failure.status },
  );
}

async function handleApprove(
  req: Request,
  siteId: string,
  text: string,
  clientProposal: SitePatchBody,
  requestId: string,
) {
  const gate = await demoDenied(req, siteId, "approve");
  if (gate) return gate;

  const { ledger, locks, storeDir } = writeBoundaryStore();
  const digest = canonicalPayloadDigest({ action: "approve", siteId, text, proposal: clientProposal });

  let outcome: WriteOutcome;
  try {
    outcome = await runIdempotentWrite<ApproveDerived>({
      storeDir,
      ledger,
      locks,
      siteId,
      action: "approve",
      requestId,
      digest,
      derive: async (): Promise<DeriveResult<ApproveDerived>> => {
        let site;
        try {
          site = await loadCustomizedSite(siteId);
        } catch (e) {
          return {
            ok: false,
            failure: {
              code: "site_not_found",
              error: e instanceof Error ? e.message : String(e),
              status: 404,
            },
          };
        }
        const parsed = parseCustomizationIntent(text);
        if (isUnsupported(parsed)) {
          return { ok: false, failure: { code: "unsupported", error: parsed.reason, status: 400 } };
        }
        const resolved = resolveCustomizationIntent(site.spec, site.graph, parsed.intent);
        if (!resolved.resolved) {
          return { ok: false, failure: { code: "unresolved", error: resolved.reason, status: 422 } };
        }
        const proposed = proposeFromSiteIntent(site.spec, resolved.siteIntent, site.graph);
        if (!proposed.ok) {
          return { ok: false, failure: { code: "no_op", error: proposed.error, status: 422 } };
        }
        const fresh = proposed.proposal;
        if (!clientProposal || clientProposal.proposalDigest !== fresh.proposalDigest) {
          return {
            ok: false,
            failure: {
              code: "stale_digest",
              error:
                "The proposal the owner approved does not match a proposal freshly " +
                "derived from the current spec. The spec moved (or the proposal was " +
                "altered) since drafting: re-run parse and review the new proposal. " +
                "Nothing was applied.",
              status: 409,
              extra: {
                expectedDigest: fresh.proposalDigest,
                receivedDigest: clientProposal?.proposalDigest,
              },
            },
          };
        }
        // Belt and suspenders: full body must equal the fresh body, not just the digest.
        if (JSON.stringify(clientProposal) !== JSON.stringify(fresh)) {
          return {
            ok: false,
            failure: {
              code: "proposal_altered",
              error: "Proposal body differs from the freshly derived proposal. Nothing was applied.",
              status: 409,
            },
          };
        }
        return {
          ok: true,
          derived: { siteIntent: resolved.siteIntent, fresh, specDigest: proposed.specDigest },
        };
      },
      execute: async (derived) => {
        const op = buildDirective(siteId, derived.siteIntent, derived.fresh, new Date().toISOString());
        const { eventId, deduped } = await emitOverlayEvent(siteId, [op], {
          requestId,
          timeoutMs: 10_000,
        });
        return {
          eventId,
          deduped,
          fields: {
            intentId: op.op === "set_presentation_intent" ? op.intentId : undefined,
            proposalDigest: derived.fresh.proposalDigest,
            specDigest: derived.specDigest,
          },
        };
      },
    });
  } catch (e) {
    return journalFailureResponse("approval", requestId, e);
  }

  switch (outcome.kind) {
    case "rejected":
      return rejectedResponse(outcome.failure);
    case "conflict":
      return idempotencyConflictResponse(requestId);
    case "unknown":
      return unknownOutcomeResponse("approval", requestId);
    case "replayed":
    case "committed": {
      const r = outcome.result;
      const replayed = outcome.kind === "replayed";
      return NextResponse.json({
        ok: true,
        siteId,
        intentId: r.intentId,
        eventId: r.eventId,
        proposalDigest: r.proposalDigest,
        specDigest: r.specDigest,
        requestId,
        // LOW consequence: presentation-intent overlay only (apply plus
        // undo); see the parse response for the directive reference.
        consequenceTier: "LOW",
        idempotentReplay: replayed,
        ...(replayed ? { deduped: r.deduped === true } : {}),
        ...(replayed
          ? {}
          : {
              note:
                "Directive journaled as a presentation-intent overlay (proposal " +
                (r.proposalDigest ?? "").slice(0, 16) +
                "...). Re-run the projection dump: " +
                "the regenerated page must show the approved section order from the " +
                "review card. The proposal was drafted against spec digest " +
                (r.specDigest ?? "").slice(0, 16) +
                ".... " +
                NOT_REAL_AUTH,
            }),
        demo: true,
        demoOwnerMode: true,
      });
    }
  }
}

async function handleClear(req: Request, siteId: string, intentId: string, requestId: string) {
  const gate = await demoDenied(req, siteId, "clear");
  if (gate) return gate;

  const { ledger, locks, storeDir } = writeBoundaryStore();
  const digest = canonicalPayloadDigest({ action: "clear", siteId, intentId });

  let outcome: WriteOutcome;
  try {
    outcome = await runIdempotentWrite<{ intentId: string }>({
      storeDir,
      ledger,
      locks,
      siteId,
      action: "clear",
      requestId,
      digest,
      derive: async () => ({ ok: true, derived: { intentId } }),
      execute: async (derived) => {
        const { eventId, deduped } = await emitOverlayEvent(
          siteId,
          [{ op: "clear_presentation_intent", intentId: derived.intentId }],
          { requestId, timeoutMs: 10_000 },
        );
        return { eventId, deduped, fields: { intentId: derived.intentId } };
      },
    });
  } catch (e) {
    return journalFailureResponse("clear", requestId, e);
  }

  switch (outcome.kind) {
    case "rejected":
      return rejectedResponse(outcome.failure);
    case "conflict":
      return idempotencyConflictResponse(requestId);
    case "unknown":
      return unknownOutcomeResponse("clear", requestId);
    case "replayed":
    case "committed": {
      const r = outcome.result;
      const replayed = outcome.kind === "replayed";
      return NextResponse.json({
        ok: true,
        siteId,
        intentId: r.intentId,
        eventId: r.eventId,
        requestId,
        idempotentReplay: replayed,
        ...(replayed
          ? {}
          : {
              note:
                "Directive removal journaled. Re-run the projection dump to render. " + NOT_REAL_AUTH,
            }),
        demo: true,
        demoOwnerMode: true,
      });
    }
  }
}

export async function POST(req: Request) {
  let body: ActionBody;
  try {
    body = (await req.json()) as ActionBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON.", demo: true }, { status: 400 });
  }
  const action = body.action ?? "";
  const siteId = (body.siteId ?? "").trim();
  if (!siteId) {
    return NextResponse.json({ ok: false, error: "siteId is required.", demo: true }, { status: 400 });
  }
  // Idempotency key for approve/clear. When the client does not supply one we
  // mint it and return it, so a lost response can still be retried safely.
  const rawRequestId = body.request_id;
  const requestId =
    typeof rawRequestId === "string" && rawRequestId.trim()
      ? rawRequestId.trim().slice(0, 128)
      : newRequestId();
  if (action === "parse") {
    const text = (body.text ?? "").trim();
    if (!text) {
      return NextResponse.json({ ok: false, error: "text is required.", demo: true }, { status: 400 });
    }
    return handleParse(siteId, text);
  }
  if (action === "approve") {
    const text = (body.text ?? "").trim();
    if (!text) {
      return NextResponse.json({ ok: false, error: "text is required.", demo: true }, { status: 400 });
    }
    if (!body.proposal) {
      return NextResponse.json(
        {
          ok: false,
          code: "no_proposal",
          error:
            "Approve requires the exact proposal the owner reviewed (from parse). " +
            "Nothing is applied without an explicit, digest-verified approval.",
          demo: true,
        },
        { status: 400 },
      );
    }
    return handleApprove(req, siteId, text, body.proposal, requestId);
  }
  if (action === "clear") {
    const intentId = (body.intentId ?? "").trim();
    if (!intentId) {
      return NextResponse.json({ ok: false, error: "intentId is required.", demo: true }, { status: 400 });
    }
    return handleClear(req, siteId, intentId, requestId);
  }
  return NextResponse.json(
    { ok: false, error: "Unknown action. Use parse, approve, or clear.", demo: true },
    { status: 400 },
  );
}
