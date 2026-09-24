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
 *   section order, digest of the spec the owner reviews.
 *
 * Failures are typed and honest: 400 (bad request / unsupported /
 * unresolved), 403 (no demo-owner mode, capability denied, public host),
 * 404 (site not found), 409 (stale digest — the spec moved since the
 * proposal was drafted), 422 (target missing from current evidence),
 * 502 (journal unreachable — nothing was recorded).
 */

import { NextResponse } from "next/server";
import { isPrivateHost } from "@/fyd/owner-mode/gate";
import {
  DEMO_OWNER_ACTOR,
  evaluateCapability,
  resolveDemoRelationship,
} from "@/fyd/owner-mode/capability";
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
import type { SitePatchBody } from "@/fyd/proceduralize/patch";

export const dynamic = "force-dynamic";

const NOT_REAL_AUTH =
  "DEMO OWNER MODE - not real authentication. No identity was verified; " +
  "this mode is for localhost/private-network demonstration only.";

function demoDenied(req: Request) {
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
  const verdict = evaluateCapability(
    DEMO_OWNER_ACTOR,
    resolveDemoRelationship("", DEMO_OWNER_ACTOR),
    "owner.customize-approve",
  );
  if (!verdict.allowed) {
    return NextResponse.json(
      {
        ok: false,
        code: "capability_denied",
        error: "Capability denied: " + verdict.reason,
        demoOwnerMode: enabled,
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
  try {
    const site = await loadCustomizedSite(siteId);
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
    demo: true,
  });
}

/**
 * Approve -> apply (journal only; render picks it up on next regen).
 * Re-derives the entire chain from the text against the CURRENT spec and
 * re-verifies every digest. A stale spec, a stale digest, or an altered
 * proposal is refused — never applied.
 */
async function handleApprove(req: Request, siteId: string, text: string, clientProposal: SitePatchBody) {
  const gate = demoDenied(req);
  if (gate) return gate;

  let site;
  try {
    site = await loadCustomizedSite(siteId);
  } catch (e) {
    return NextResponse.json(
      { ok: false, code: "site_not_found", error: e instanceof Error ? e.message : String(e), demo: true },
      { status: 404 },
    );
  }
  const parsed = parseCustomizationIntent(text);
  if (isUnsupported(parsed)) {
    return NextResponse.json(
      { ok: false, code: "unsupported", error: parsed.reason, demo: true },
      { status: 400 },
    );
  }
  const resolved = resolveCustomizationIntent(site.spec, site.graph, parsed.intent);
  if (!resolved.resolved) {
    return NextResponse.json(
      { ok: false, code: "unresolved", error: resolved.reason, demo: true },
      { status: 422 },
    );
  }
  const outcome = proposeFromSiteIntent(site.spec, resolved.siteIntent, site.graph);
  if (!outcome.ok) {
    return NextResponse.json(
      { ok: false, code: "no_op", error: outcome.error, demo: true },
      { status: 422 },
    );
  }
  const fresh = outcome.proposal;
  if (
    !clientProposal ||
    clientProposal.proposalDigest !== fresh.proposalDigest
  ) {
    return NextResponse.json(
      {
        ok: false,
        code: "stale_digest",
        error:
          "The proposal the owner approved does not match a proposal freshly " +
          "derived from the current spec. The spec moved (or the proposal was " +
          "altered) since drafting: re-run parse and review the new proposal. " +
          "Nothing was applied.",
        expectedDigest: fresh.proposalDigest,
        receivedDigest: clientProposal?.proposalDigest,
        demo: true,
      },
      { status: 409 },
    );
  }
  // Belt and suspenders: full body must equal the fresh body, not just the digest.
  if (JSON.stringify(clientProposal) !== JSON.stringify(fresh)) {
    return NextResponse.json(
      {
        ok: false,
        code: "proposal_altered",
        error: "Proposal body differs from the freshly derived proposal. Nothing was applied.",
        demo: true,
      },
      { status: 409 },
    );
  }

  const op = buildDirective(siteId, resolved.siteIntent, fresh, new Date().toISOString());
  let eventId: string;
  try {
    eventId = await emitOverlayEvent(siteId, [op]);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        code: "journal_unavailable",
        error:
          "The approval was NOT recorded: " + (e instanceof Error ? e.message : String(e)),
        demo: true,
      },
      { status: 502 },
    );
  }
  return NextResponse.json({
    ok: true,
    siteId,
    intentId: op.op === "set_presentation_intent" ? op.intentId : undefined,
    eventId,
    proposalDigest: fresh.proposalDigest,
    specDigest: outcome.specDigest,
    note:
      "Directive journaled as a presentation-intent overlay (proposal " +
      fresh.proposalDigest.slice(0, 16) + "...). Re-run the projection dump: " +
      "the regenerated page must show the approved section order from the " +
      "review card. The proposal was drafted against spec digest " +
      outcome.specDigest.slice(0, 16) + ".... " + NOT_REAL_AUTH,
    demo: true,
    demoOwnerMode: true,
  });
}

async function handleClear(req: Request, siteId: string, intentId: string) {
  const gate = demoDenied(req);
  if (gate) return gate;
  let eventId: string;
  try {
    eventId = await emitOverlayEvent(siteId, [
      { op: "clear_presentation_intent", intentId },
    ]);
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        code: "journal_unavailable",
        error: "The clear was NOT recorded: " + (e instanceof Error ? e.message : String(e)),
        demo: true,
      },
      { status: 502 },
    );
  }
  return NextResponse.json({
    ok: true,
    siteId,
    intentId,
    eventId,
    note: "Directive removal journaled. Re-run the projection dump to render. " + NOT_REAL_AUTH,
    demo: true,
    demoOwnerMode: true,
  });
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
    return handleApprove(req, siteId, text, body.proposal);
  }
  if (action === "clear") {
    const intentId = (body.intentId ?? "").trim();
    if (!intentId) {
      return NextResponse.json({ ok: false, error: "intentId is required.", demo: true }, { status: 400 });
    }
    return handleClear(req, siteId, intentId);
  }
  return NextResponse.json(
    { ok: false, error: "Unknown action. Use parse, approve, or clear.", demo: true },
    { status: 400 },
  );
}
