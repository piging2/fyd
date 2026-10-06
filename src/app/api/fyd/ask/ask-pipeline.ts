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
 * The legacy flat POST /api/fyd/ask keeps its body shape ({ siteId,
 * objectId?, question, mode }) but never adopts the body siteId as the
 * subject tenant (Q-P0-06 Mission M: "body is identity" is closed on this
 * route). It 308-redirects to the trusted-path POST /api/fyd/ask/[siteId],
 * which re-applies the trusted validation there. New callers must use the
 * trusted-path route directly.
 *
 * 5-class response contract: every 200 response carries
 * answerClass (exactly one of "SUPPORTED DIRECTLY" | "SUPPORTED BY
 * MULTIPLE EVIDENCE" | "DERIVED" | "CONFLICTED" | "UNSUPPORTED") and the
 * coarse answerState ("KNOWN" | "CONFLICTED" | "UNKNOWN") fed by it (both
 * layers, always present). Every citation carries claimClass
 * ("SUPPORTED DIRECTLY" | "DERIVED" | "CONFLICTED"), and the 200 body also
 * carries objectRefs, evidenceRefs, sourceRefs (structured, citation-backed),
 * unknowns (string[]), suggestedActions (available actions, [] when none),
 * and proposal (draft AskProposal or null).
 * A refusal (no cited evidence) is answerClass "UNSUPPORTED" / answerState
 * "UNKNOWN". Any conflict-observation cite makes the answer "CONFLICTED" /
 * "CONFLICTED". Any derived/inferred/generated claim makes the answer
 * "DERIVED" (still answerState "KNOWN": derived but answered, explicitly
 * labeled). Two or more distinct SUPPORTED DIRECTLY cites behind the SAME
 * claim make the answer "SUPPORTED BY MULTIPLE EVIDENCE". DERIVED_FACT /
 * INFERENCE / GENERATED_COPY claims are explicitly labeled in the citation
 * basis. The pipeline never fills business gaps from model priors.
 *
 * PROD-9 answer-class polarity: every 200 also carries responseClass
 * ("ANSWER" | "DENIAL" | "PREMISE_REJECTED"): what the answer IS, for the
 * UI to render unambiguously. DENIAL = the pipeline refused (out of
 * scope, no evidence, no authority). PREMISE_REJECTED = the question
 * assumed something false and the answer states the corrected premise.
 * ANSWER = a normal answer. Surface-only; the 5-class contract is
 * unchanged.
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
  answerStateFor,
  responseClassFor,
  type AnswerAskFydDeps,
  type AskAnswerClass,
  type AskAnswerState,
  type AskClaimClassification,
  type AskFydCitation,
  type AskFydMode,
  type AskFydOutcome,
  type AskResponseClass,
} from "@/fyd/ask/visitor-answer";
import {
  ASK_RESPONSE_CONTRACT_VERSION,
  AskContractError,
  assertAskAnswerContract,
  contractClaimsFor,
} from "@/fyd/ask/contract";
import {
  requireTenantContext,
  TenantContextError,
} from "@/fyd/tenant/tenant-context";
import { getSiteBundle, type SiteBundle } from "@/fyd/media/site-bundle";
import type { FydOverlayReader } from "@/fyd/data/fyd-tenant-graph";
import { applyOwnerFieldCorrections } from "@/fyd/object/owner-overlay";
import {
  decisionsForGraph,
  verifyPublicProjection,
} from "@/fyd/sitespec/public-projection";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Answer-level class for the 5-class contract (re-exported for tests). */
export type { AskAnswerClass, AskAnswerState };
/** PROD-9: answer-class polarity (re-exported for tests). */
export type { AskResponseClass };

const VALID_MODES: AskFydMode[] = ["visitor", "owner"];

/**
 * Bundle loader for Ask FYD: loads the site bundle through the authorized
 * application read seam (fixture base graph + journal overlays via the
 * governed PingObjectReader, digest-verified) and composes the tenant's
 * owner overlay (field corrections) over it, ABOVE the read seam. The read
 * model is the authorized graph read, so a correction the owner approved is
 * reflected in Ask FYD answers, cited as an owner override while the
 * source's value stays recorded as what the source says. The graph Ask
 * answers from is the verified public projection (Q-C-01): the bundle
 * never carries an unprojected graph. Fail closed: on overlay or boundary
 * failure nothing is served, never an unprojected graph or invented value.
 *
 * The reader override exists for tests only; production always uses the
 * governed reader.
 */
export async function loadBundleWithOwnerOverlay(
  siteId: string,
  reader?: FydOverlayReader,
): Promise<SiteBundle | null> {
  const bundle = await getSiteBundle(siteId, reader ? { reader } : undefined);
  if (!bundle) return null;
  try {
    const overlaid = applyOwnerFieldCorrections(bundle.graph, siteId);
    // THE boundary (Q-C-01): Ask FYD consumes an already-authorized public
    // projection, it never retrieves broadly and redacts afterward. Owner
    // corrections are owner-authorized values composed BEFORE the boundary;
    // visibility policy applies over them, so a hidden field stays hidden
    // even when the owner corrected its value. The siteId is threaded so
    // site-keyed owner visibility decisions resolve (Lane A). Fail closed:
    // on boundary failure nothing is served, never the unprojected graph.
    const decisions = decisionsForGraph(overlaid.graph, siteId);
    const verified = verifyPublicProjection(overlaid.graph, decisions, "anonymous");
    return {
      ...bundle,
      graph: verified.graph,
      fieldVisibilityDecisions: decisions,
    };
  } catch {
    return null;
  }
}

/** Body keys that claim a tenant identity. Only the route path may do that. */
const TENANT_CLAIM_KEYS = ["siteId", "tenantId", "tenant"] as const;

/**
 * Reduce one answered outcome to its 5-class label. A refusal (or an answer
 * with no citations) is "UNSUPPORTED": the pipeline had nothing to stand
 * on, so the answer is honest unknown. Any CONFLICTED cite makes the whole
 * answer "CONFLICTED" (the disagreement is surfaced, never resolved by
 * picking a side). Any derived/inferred/generated cite makes the answer
 * "DERIVED". "SUPPORTED BY MULTIPLE EVIDENCE" requires at least two
 * distinct SUPPORTED DIRECTLY evidence refs behind the SAME claim
 * (grouped via claimClassifications: evidenceRefIds per claim); a single
 * direct cite, or direct cites behind different claims, is "SUPPORTED
 * DIRECTLY". When no claim groupings are provided, each evidence ref is
 * treated as its own claim (conservative: never upgrade without proof).
 *
 * The coarse state follows from answerStateFor (both layers, always).
 */
export function answerClassFor(
  refusal: boolean,
  citations: AskFydCitation[],
  claimClassifications?: AskClaimClassification[],
): AskAnswerClass {
  if (refusal || citations.length === 0) return "UNSUPPORTED";
  if (citations.some((c) => c.claimClass === "CONFLICTED")) return "CONFLICTED";
  if (citations.some((c) => c.claimClass === "DERIVED")) return "DERIVED";
  // Group direct evidence refs by the claim they support.
  const claimForRef = new Map<string, string>();
  for (const cc of claimClassifications ?? []) {
    for (const refId of cc.evidenceRefIds) {
      if (!claimForRef.has(refId)) claimForRef.set(refId, cc.claim);
    }
  }
  const directByClaim = new Map<string, Set<string>>();
  for (const c of citations) {
    if (c.claimClass !== "SUPPORTED DIRECTLY") continue;
    // No grouping info: each ref stands alone (never upgrade without proof).
    const claim = claimForRef.get(c.id) ?? c.id;
    let ids = directByClaim.get(claim);
    if (!ids) {
      ids = new Set();
      directByClaim.set(claim, ids);
    }
    ids.add(c.id);
  }
  for (const ids of directByClaim.values()) {
    if (ids.size >= 2) return "SUPPORTED BY MULTIPLE EVIDENCE";
  }
  return "SUPPORTED DIRECTLY";
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
 *   (/api/fyd/ask/[siteId]), or null for the legacy flat route, which
 *   never adopts a subject tenant and redirects to the trusted path.
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
    // Legacy flat route (Q-P0-06 Mission M): the body-supplied siteId is
    // NOT adopted as the subject tenant. "Body is identity" is closed on
    // this route: the request is routed through the trusted [siteId]
    // route instead, via 308 to the path-addressed URL. The trusted route
    // re-applies its validation there (a body tenant claim that disagrees
    // with the path tenant is refused with 400 tenant_mismatch).
    // Fetch-based callers follow 307/308 with method and body preserved,
    // so legitimate callers keep working. Nothing is served on this route:
    // the redirect carries no answer, no objects, no citations. The URL
    // query string is never a tenant source here.
    const raw = typeof record.siteId === "string" ? record.siteId.trim() : "";
    if (!raw) {
      return NextResponse.json(
        {
          ok: false,
          code: "flat_route_deprecated",
          error:
            "The legacy flat ask route no longer accepts a tenant from the request body. " +
            "Use POST /api/fyd/ask/{siteId} with the tenant in the route path.",
          trustedRoute: "/api/fyd/ask/{siteId}",
        },
        { status: 400 },
      );
    }
    let redirectTenant: string;
    try {
      redirectTenant = requireTenantContext({ tenantId: raw });
    } catch (err) {
      if (err instanceof TenantContextError) return invalidTenantResponse(raw);
      throw err;
    }
    return new NextResponse(null, {
      status: 308,
      headers: { Location: "/api/fyd/ask/" + encodeURIComponent(redirectTenant) },
    });
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

  // The bundle loads through the authorized graph read on every request
  // (re-read on every serve). A load or verification failure is the same
  // honest unknown as a missing projection: never an answer, never a leak.
  let bundle: SiteBundle | null;
  try {
    bundle = await loadBundleWithOwnerOverlay(siteId);
  } catch (err) {
    console.error(
      `answerAskFyd: projection load failed for site "${siteId}":`,
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      {
        ok: false,
        kind: "projection_unavailable",
        error:
          "I could not load this site's data, so I cannot answer your question. The answer is unknown.",
        attempted: "load the site's verified data projection",
        answerUnknown: true,
      },
      { status: 503 },
    );
  }

  const deps: AnswerAskFydDeps = {
    // Tenant-scoped: the answer engine can only ever load this request's
    // tenant bundle, never another tenant's graph.
    loadBundle: (id) => (id === siteId ? bundle : null),
  };

  let outcome: AskFydOutcome;
  try {
    outcome = answerAskFyd(
      {
        siteId,
        objectId: rawObjectId.length > 0 ? rawObjectId : undefined,
        question,
        mode: mode as AskFydMode,
        // FYD-Q1/Q2: the bundle carries declared conflicts and owner
        // visibility decisions; the ask lane honors them fail-closed.
        fieldConflicts: bundle?.fieldConflicts,
        fieldVisibilityDecisions: bundle?.fieldVisibilityDecisions,
      },
      deps,
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
  const answerClass = answerClassFor(
    outcome.refusal,
    outcome.citations,
    outcome.claimClassifications,
  );
  // Coarse state, fed by the five support classes (both layers).
  const answerState = answerStateFor(answerClass);
  // PROD-9: answer-class polarity for the UI: DENIAL (refusal),
  // PREMISE_REJECTED (the question's premise is wrong and the answer
  // states the corrected premise), ANSWER (normal). Surface-only.
  const responseClass = responseClassFor({
    refusal: outcome.refusal,
    question,
    answer: outcome.answer,
    claimClassifications: outcome.claimClassifications,
  });
  // CLAIMS: every factual claim with its support class and evidence refs.
  const claims = contractClaimsFor(outcome.claimClassifications);
  // THE binding-contract enforcement seam (Nolan 2026-09-25): the answer
  // the pipeline produced is checked against the contract it claims.
  // A violation is a pipeline bug, so the route fails closed as
  // honest-unknown instead of serving a structurally dishonest answer.
  // No new authority: truth stays upstream; this checks the output shape.
  try {
    assertAskAnswerContract({ outcome, answerClass, answerState, claims });
  } catch (err) {
    if (err instanceof AskContractError) {
      console.error(`answerAskFyd: contract violation for site "${siteId}":`, err.message);
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
    throw err;
  }
  return NextResponse.json({
    ok: true,
    contractVersion: ASK_RESPONSE_CONTRACT_VERSION,
    answer: outcome.answer,
    answerClass,
    answerState,
    // PROD-9: answer-class polarity: "ANSWER" | "DENIAL" | "PREMISE_REJECTED".
    responseClass,
    refusal: outcome.refusal,
    citations: outcome.citations,
    // OUTPUT "CLAIMS": claim text + support class + the evidence ref ids
    // behind it. Every factual answer is recoverable to evidence here.
    claims,
    // Structured, citation-backed refs: the objects, evidence, and sources
    // the answer stands on. Derived from citations only; never invented.
    objectRefs: outcome.objectRefs,
    evidenceRefs: outcome.evidenceRefs,
    sourceRefs: outcome.sourceRefs,
    // Carried from the internal AskAnswer: unknowns and suggestedActions
    // are [] when the composer found none; proposal is null unless the
    // answer drafted one. Nothing here is ever invented.
    unknowns: outcome.unknowns,
    suggestedActions: outcome.suggestedActions,
    proposal: outcome.proposal,
    tenantId: siteId,
  });
}
