/**
 * Tenant-safe Ask FYD request handling, shared by POST /api/fyd/ask and
 * POST /api/fyd/ask/[siteId].
 *
 * G3 (tenant from the trusted path): the nested /ask/[siteId] route derives
 * the tenant from the route path param, never from the request body or URL
 * query. A TenantContext is constructed server-side via requireTenantContext
 * (which also enforces the DNS-safe slug pattern, killing path traversal).
 * Any body-supplied tenant identity (siteId / tenantId / tenant keys) that
 * disagrees with the route tenant is REFUSED with 400 tenant_mismatch: the
 * request is served for the route tenant or refused, never for the
 * body-claimed tenant.
 *
 * The legacy flat POST /api/fyd/ask keeps its body contract ({ siteId,
 * objectId?, question, mode }) but now constructs the TenantContext
 * server-side from
 * the validated body siteId (previously: no tenant context at all). The
 * nested route is the trusted-path surface; prefer it for new callers.
 *
 * 3-class response contract: every 200 response carries
 * answerClass ("supported" | "derived" | "unknown"), every citation
 * carries claimClass ("supported" | "derived"), and the 200 body also
 * carries unknowns (string[]), suggestedActions (available actions,
 * [] when none), and proposal (draft AskProposal or null).
 * A refusal (no cited evidence) is answerClass "unknown". DERIVED_FACT / INFERENCE /
 * GENERATED_COPY claims make the answer "derived" and are explicitly
 * labeled in the citation basis.
 *
 * Object-scoped ask: the optional body objectId selects the target
 * object INSIDE the route tenant's public graph; the tenant is still
 * chosen by the route path (or the validated body siteId on the legacy
 * flat route), never by objectId. Unknown ids -> 404 unknown_object;
 * non-public objects never enter the public graph, so they fail closed
 * the same way. objectId is object identity only, never a tenant key.
 *
 * Visitor vs owner scope: mode "visitor" (default) answers from PUBLIC
 * facts only. mode "owner" is accepted for a future authenticated lane but
 * until that lane exists it is treated as visitor-safe: it grants nothing
 * and changes nothing. There is deliberately no code path here that serves
 * owner-private facts.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  answerAskFyd,
  type AnswerAskFydDeps,
  type AskFydCitation,
  type AskFydMode,
  type AskFydOutcome,
} from "@/fyd/ask/visitor-answer";
import {
  requireTenantContext,
  TenantContextError,
} from "@/fyd/tenant/tenant-context";
import { getSiteBundle, type SiteBundle } from "@/fyd/media/site-bundle";
import { applyOwnerFieldCorrections } from "@/fyd/object/owner-overlay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Answer-level class for the 3-class contract. */
export type AskAnswerClass = "supported" | "derived" | "unknown";

const VALID_MODES: AskFydMode[] = ["visitor", "owner"];

/**
 * Bundle loader for Ask FYD: loads the static bundle and composes the
 * tenant's owner overlay (field corrections) over it. The read model is the
 * owner-event projection, so a correction the owner approved is reflected
 * in Ask FYD answers, cited as an owner override while the source's value
 * stays recorded as what the source says. Fail closed: on overlay failure
 * the raw bundle is served, never an invented value.
 */
function loadBundleWithOwnerOverlay(siteId: string): SiteBundle | null {
  const bundle = getSiteBundle(siteId);
  if (!bundle) return null;
  try {
    const overlaid = applyOwnerFieldCorrections(bundle.graph, siteId);
    return { ...bundle, graph: overlaid.graph };
  } catch {
    return bundle;
  }
}

const ASK_DEPS: AnswerAskFydDeps = { loadBundle: loadBundleWithOwnerOverlay };

/** Body keys that claim a tenant identity. Only the route path may do that. */
const TENANT_CLAIM_KEYS = ["siteId", "tenantId", "tenant"] as const;

/**
 * Reduce one answered outcome to its 3-class label. A refusal (or an answer
 * with no citations) is "unknown": the pipeline had nothing to stand on.
 * Any derived/inferred/generated claim makes the whole answer "derived".
 */
export function answerClassFor(
  refusal: boolean,
  citations: AskFydCitation[],
): AskAnswerClass {
  if (refusal || citations.length === 0) return "unknown";
  return citations.some((c) => c.claimClass === "derived") ? "derived" : "supported";
}

function tenantMismatchResponse(
  routeTenantId: string,
  key: string,
  claimed: string,
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      code: "tenant_mismatch",
      error:
        "Tenant identity comes from the request route, not the request body: " +
        "the body claimed tenant \"" +
        claimed +
        "\" under key \"" +
        key +
        "\" while the route serves tenant \"" +
        routeTenantId +
        "\". The request was refused; nothing was served for the claimed tenant.",
      routeTenantId,
      rejectedKey: key,
    },
    { status: 400 },
  );
}

function invalidTenantResponse(raw: string): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      code: "invalid_tenant",
      error:
        "Refusing to act: \"" +
        raw +
        "\" is not a valid tenant id. Tenant ids are DNS-safe slugs.",
    },
    { status: 400 },
  );
}

/**
 * Handle one Ask FYD POST.
 *
 * @param routeTenantId the tenant from the trusted route path
 *   (/api/fyd/ask/[siteId]), or null for the legacy flat route where the
 *   subject tenant comes from the validated body siteId.
 */
export async function handleAskRequest(
  routeTenantId: string | null,
  request: NextRequest,
): Promise<NextResponse> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const record =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : ({} as Record<string, unknown>);

  let siteId: string;
  if (routeTenantId !== null) {
    // Trusted path: the tenant is the route param, constructed server-side.
    try {
      siteId = requireTenantContext({ tenantId: routeTenantId });
    } catch (err) {
      if (err instanceof TenantContextError) return invalidTenantResponse(routeTenantId);
      throw err;
    }
    // Reject body-supplied tenant identity that disagrees with the route.
    // A matching claim is harmless and ignored; a mismatch is refused.
    for (const key of TENANT_CLAIM_KEYS) {
      const claimed = record[key];
      if (typeof claimed === "string" && claimed.trim().length > 0 && claimed.trim() !== siteId) {
        return tenantMismatchResponse(siteId, key, claimed.trim());
      }
    }
  } else {
    // Legacy flat route: subject tenant from the validated body siteId,
    // constructed server-side (previously no tenant context existed here).
    const raw = typeof record.siteId === "string" ? record.siteId.trim() : "";
    if (!raw) {
      return NextResponse.json({ ok: false, error: "Unknown site." }, { status: 404 });
    }
    try {
      siteId = requireTenantContext({ tenantId: raw });
    } catch (err) {
      if (err instanceof TenantContextError) return invalidTenantResponse(raw);
      throw err;
    }
  }

  const question = typeof record.question === "string" ? record.question : "";
  const rawObjectId = typeof record.objectId === "string" ? record.objectId.trim() : "";
  const mode = record.mode === undefined ? "visitor" : record.mode;
  if (!VALID_MODES.includes(mode as AskFydMode)) {
    return NextResponse.json(
      { ok: false, error: "mode must be 'visitor' or 'owner'." },
      { status: 400 },
    );
  }

  let outcome: AskFydOutcome;
  try {
    outcome = answerAskFyd(
      {
        siteId,
        objectId: rawObjectId.length > 0 ? rawObjectId : undefined,
        question,
        mode: mode as AskFydMode,
      },
      ASK_DEPS,
    );
  } catch {
    // The pipeline never throws by contract, but a route handler must never
    // leak an empty 500 if anything ever does: fail honestly and structurally.
    return NextResponse.json(
      {
        ok: false,
        kind: "internal_error",
        error: "Ask FYD hit an unexpected problem. The answer is unknown.",
        answerUnknown: true,
      },
      { status: 500 },
    );
  }
  if (!outcome.ok) {
    switch (outcome.error.kind) {
      case "unknown_site":
        return NextResponse.json({ ok: false, error: outcome.error.message }, { status: 404 });
      case "bad_question":
        return NextResponse.json({ ok: false, error: outcome.error.message }, { status: 400 });
      case "bad_mode":
        return NextResponse.json({ ok: false, error: outcome.error.message }, { status: 400 });
      case "unknown_object":
        return NextResponse.json({ ok: false, error: outcome.error.message }, { status: 404 });
      case "projection_unavailable":
        return NextResponse.json(
          {
            ok: false,
            kind: outcome.error.kind,
            error: outcome.error.message,
            attempted: "load the site's verified data projection",
            answerUnknown: true,
          },
          { status: 503 },
        );
      default:
        return NextResponse.json(
          { ok: false, error: "This site is not available right now." },
          { status: 500 },
        );
    }
  }
  return NextResponse.json({
    ok: true,
    answer: outcome.answer,
    answerClass: answerClassFor(outcome.refusal, outcome.citations),
    refusal: outcome.refusal,
    citations: outcome.citations,
    // Carried from the internal AskAnswer: unknowns and suggestedActions
    // are [] when the composer found none; proposal is null unless the
    // answer drafted one. Nothing here is ever invented.
    unknowns: outcome.unknowns,
    suggestedActions: outcome.suggestedActions,
    proposal: outcome.proposal,
    tenantId: siteId,
  });
}
