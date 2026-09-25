/**
 * POST /api/fyd/objects/[objectId]/overrides
 *
 * Owner intent as a digest-bound two-step loop: PROPOSE then APPROVE.
 *
 *   { stage: "propose", text: "Correct phone to +1 555 123 4567" }
 *     -> interprets the free text into a typed OwnerCommand and returns a
 *        proposal { command, summary } plus a preview (before/after +
 *        evidence/capability impact) and digests { baseStateDigest,
 *        patchDigest }. NOTHING IS WRITTEN at this stage.
 *
 *   { stage: "approve", command: {...}, baseStateDigest, patchDigest }
 *     -> re-reads the CURRENT owner state and recomputes its digest. If it
 *        no longer matches baseStateDigest the state moved since the
 *        proposal was drafted: 409 stale_proposal, nothing written. If the
 *        command no longer matches patchDigest: 400, nothing written.
 *        Otherwise validates, applies, and returns the refreshed public
 *        ObjectView, the human-language history, a bound approval record
 *        (tenant + actor + base digest + patch digest + approval metadata +
 *        result digest), and the chain audit trail. Only this stage mutates.
 *
 * G4 (tenant from the trusted path): the object id IS the site id, so the
 * OwnerContext is constructed server-side from the route param via
 * createOwnerContext (the single owner-context seam). Any
 * body-supplied tenant identity (siteId / tenantId / tenant keys) that
 * disagrees with the route tenant is REFUSED with 400 tenant_mismatch.
 * A tenant mismatch never serves another tenant's object.
 *
 * DEMO/DEV ONLY: there is no production authentication on this route. It is
 * the seam where real owner auth will attach; until that lane exists, every
 * response is stamped through the OwnerContext seam with demoOwnerContext:
 * true plus the actor disclosure, and the Manage surface labels every
 * session DEV/DEMO. This route must not be treated as a production owner
 * API.
 *
 * The approve stage enforces the owner-core chain:
 *   SESSION -> PING IDENTITY -> CONTROL RELATIONSHIP -> CAPABILITY
 *     -> PROPOSE/APPLY RULE -> EVENT -> PROJECTION.
 * ctx.evaluateCapability evaluates the chain through the OwnerContext
 * seam; a denied owner.correct-fact verdict returns 403 and nothing is
 * written. The OwnerContext is required on every mutation: the actor is
 * always the seeded demo actor, labeled as DEMO OWNER CONTEXT.
 * Authentication alone NEVER grants mutation.
 *
 * AUTHORITY GRADIENT (locked product law, Nolan's 155 grill answers):
 * the loop reflects consequence: FOUR tiers, not three.
 * commandConsequenceTier classifies each OwnerCommand:
 * - "LOW" (reversible presentation change: reorder, non-factual
 *   layout): apply with undo. The proposal stays digest-bound to its base
 *   state (the proven safety property), and a successful approve returns
 *   a ready `undo` (exact inverse command pre-bound to the post-apply
 *   digests), so the owner can reverse it in one approve call. No public
 *   fact is altered. Owner-facing language: "Change the website".
 * - "MEDIUM" (factual correction, contact presentation, service
 *   visibility, business description, ADDRESS VISIBILITY hide/show/
 *   default): proposal + simple confirmation (FYD product authority
 *   directive, Nolan 2026-09-25: address hide/show is MEDIUM, not LOW).
 *   The full propose -> digest-bound approve loop, and the approval
 *   records an owner assertion (actor + timestamp) while the source
 *   record is never rewritten. Owner-facing language: "Update the
 *   business" (knowledge transition: site, Ask, search, all projections).
 * - "HIGH" (pricing, credentials, ownership, employee identity, external
 *   publication, messages, booking, provider mutation, financial/legal
 *   claims): explicit authorization. Free text matching these categories
 *   is refused at propose with the category named; nothing is drafted,
 *   nothing is written.
 * - "CRITICAL" (credentials, ownership transfer, financial moves, legal
 *   commitments): strong authority + explicit confirmation + receipt.
 *   Refused at propose in this lane; every CRITICAL decision produces a
 *   receipt through the external-effects resolution chain:
 *   ACTOR / INTENT / TARGET / CAPABILITY / POLICY / AUTHORITY /
 *   EXECUTION / RECEIPT / OUTCOME.
 * Approval never confers capability: the capability gate runs on every
 * approve call regardless of tier. Autonomy is per action class + scope +
 * constraints; there is no global autonomous flag and no
 * provider-specific action authority.
 *
 * Failures are typed 400s/409s/403s; nothing is written on failure.
 */

import { NextRequest, NextResponse } from "next/server";
import { loadObjectView, knownServices } from "@/fyd/object/view";
import {
  buildEffectReceipt,
  changeKindForTier,
  commandConsequenceTier,
  consequenceNoteFor,
  describeCommand,
  detectHighConsequenceRequest,
  interpretTextCommand,
  invertOwnerCommand,
} from "@/fyd/object/commands";
import { foldLegacyTier } from "@/fyd/object/consequence-tiers";
import {
  classifyOwnerAction,
  frictionForTier,
} from "@/fyd/object/consequence-classification";
import {
  applyOwnerCommand,
  parseOwnerCommand,
  OwnerCommandError,
} from "@/fyd/object/owner-store";
import {
  getPingObjectGraphSync,
  getVerifiedPublicProjectionSync,
} from "@/fyd/data/ping-object-source";
import { readOverrides } from "@/fyd/object/owner-store";
import { findBusinessObject, rawFieldValue } from "@/fyd/object/owner-overlay";
import { TenantContextError } from "@/fyd/tenant/tenant-context";
import type { OwnerCommand } from "@/fyd/object/types";
import {
  buildBoundApproval,
  buildPatchPreview,
  buildViewDigest,
  digestOf,
  lastEventId,
  ownerStateDigest,
  patchDigestOf,
} from "./patch-loop";
import {
  createOwnerContext,
  ownerContextRefusalLabel,
  type OwnerContext,
} from "./owner-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Body keys that claim a tenant identity. Only the route path may do that. */
const TENANT_CLAIM_KEYS = ["siteId", "tenantId", "tenant"] as const;

function tenantMismatchResponse(ctx: OwnerContext, key: string, claimed: string) {
  return NextResponse.json(
    {
      ...ctx.responseLabel(),
      ok: false,
      code: "tenant_mismatch",
      error:
        "Tenant identity comes from the request route, not the request body: " +
        "the body claimed tenant \"" +
        claimed +
        "\" under key \"" +
        key +
        "\" while the route serves tenant \"" +
        ctx.tenantId +
        "\". The request was refused; nothing was served or written for the claimed tenant.",
      tenantId: ctx.tenantId,
      rejectedKey: key,
    },
    { status: 400 },
  );
}

/**
 * GET /api/fyd/objects/[objectId]/overrides
 *
 * Owner-lane read (Q-C-01): the owner-authorized ObjectView built over the
 * OWNER projection (hidden fields stay visible to the owner for
 * management) plus the human-language owner history. This is the Manage
 * surface's read path; the public GET /api/fyd/objects/[objectId] never
 * serves history.
 *
 * DEMO/DEV ONLY, same as POST: no production authentication. The
 * OwnerContext seam stamps the response; the Manage surface labels every
 * session DEV/DEMO.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ objectId: string }> },
) {
  const { objectId } = await params;
  let ctx: OwnerContext;
  try {
    ctx = await createOwnerContext(objectId);
  } catch (err) {
    if (err instanceof TenantContextError) {
      return NextResponse.json(
        {
          ...ownerContextRefusalLabel(),
          ok: false,
          code: "invalid_tenant",
          error:
            "Refusing to act: the route object id is not a valid tenant id. " +
            "Tenant ids are DNS-safe slugs.",
        },
        { status: 400 },
      );
    }
    throw err;
  }
  let projection;
  try {
    projection = getVerifiedPublicProjectionSync(objectId, "owner");
  } catch {
    return NextResponse.json(
      { ...ctx.responseLabel(), ok: false, error: "Unknown object." },
      { status: 404 },
    );
  }
  const view = loadObjectView(projection, objectId);
  if (!view) {
    return NextResponse.json(
      { ...ctx.responseLabel(), ok: false, error: "Unknown object." },
      { status: 404 },
    );
  }
  const history = readOverrides(objectId).history;
  return NextResponse.json({
    ...ctx.responseLabel(),
    ok: true,
    view,
    history,
    siteId: objectId,
  });
}

/**
 * Authority-UX lane: the consequence classification that travels with a
 * proposal/decision record (tier + plain-language consequence + friction),
 * so WHY THIS and audit can show it. The renderer never invents this:
 * it reads it off the record.
 */
function classificationRecord(command: OwnerCommand) {
  const c = classifyOwnerAction({ kind: "owner-command", command });
  return {
    tier: c.tier,
    productTier: c.productTier,
    ownerConsequence: c.ownerConsequence,
    rationale: c.rationale,
    friction: c.friction,
    changeKind: c.changeKind,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ objectId: string }> },
) {
  const { objectId } = await params;

  // G4: the tenant comes from the trusted route path. The object id IS the
  // site id (listObjectIds serves the PING-backed site projections), so the
  // OwnerContext is constructed server-side here, before any I/O, through
  // the single owner-context seam: createOwnerContext (DemoOwnerContext
  // today; a PING identity/capability implementation later, by changing
  // the factory body alone - this route does not change).
  // Even the invalid-tenant refusal is stamped with the seam's refusal
  // label: no response leaves this route unlabeled.
  let ctx: OwnerContext;
  try {
    ctx = await createOwnerContext(objectId);
  } catch (err) {
    if (err instanceof TenantContextError) {
      return NextResponse.json(
        {
          ...ownerContextRefusalLabel(),
          ok: false,
          code: "invalid_tenant",
          error:
            "Refusing to act: the route object id is not a valid tenant id. " +
            "Tenant ids are DNS-safe slugs.",
        },
        { status: 400 },
      );
    }
    throw err;
  }

  // Owner-authorized read (Q-C-01): the owner projection passes the
  // boundary with the owner viewer policy, so hidden fields stay visible
  // to the owner for management.
  let ownerProjection;
  try {
    ownerProjection = getVerifiedPublicProjectionSync(objectId, "owner");
  } catch {
    return NextResponse.json({ ...ctx.responseLabel(), ok: false, error: "Unknown object." }, { status: 404 });
  }
  if (!loadObjectView(ownerProjection, objectId)) {
    return NextResponse.json({ ...ctx.responseLabel(), ok: false, error: "Unknown object." }, { status: 404 });
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const record =
    typeof body === "object" && body !== null ? (body as Record<string, unknown>) : ({} as Record<string, unknown>);

  // Reject body-supplied tenant identity that disagrees with the route.
  for (const key of TENANT_CLAIM_KEYS) {
    const claimed = record[key];
    if (typeof claimed === "string" && claimed.trim().length > 0 && claimed.trim() !== ctx.tenantId) {
      return tenantMismatchResponse(ctx, key, claimed.trim());
    }
  }

  const stage = record.stage;

  // Stage 1: interpret only. Never writes.
  if (stage === "propose") {
    const text = record.text;
    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ ...ctx.responseLabel(), ok: false, error: "Describe the change in plain language." }, { status: 400 });
    }
    const proposal = interpretTextCommand(text, objectId);
    if (!proposal) {
      // HIGH / CRITICAL consequence: free text the interpreter does not
      // understand as a typed command may still be an action request in a
      // consequential category (pricing, credentials, ownership, external
      // publication, messages, booking, provider mutation, financial/legal).
      // These are refused at propose with the category named and a
      // decision receipt through the external-effects resolution chain
      // (ACTOR / INTENT / TARGET / CAPABILITY / POLICY / AUTHORITY /
      // EXECUTION / RECEIPT / OUTCOME). Nothing is drafted, nothing is
      // written, and no approval can be presented for them.
      const detected = detectHighConsequenceRequest(text);
      if (detected) {
        const evaluation = await ctx.evaluateCapability(objectId, "owner.correct-fact");
        const receipt = buildEffectReceipt({
          actor: {
            id: ctx.actor.actorId,
            label: ctx.actor.label,
            demo: true,
          },
          intentText: text.trim(),
          category: detected.category,
          tier: detected.tier,
          target: { tenantId: ctx.tenantId, objectId },
          capability: {
            // Preserve the real capability evaluation: the refusal below is
            // caused by POLICY (tier) and AUTHORITY (demo context), not by a
            // capability denial. Fabricating allowed:false here would
            // contradict the evaluation's own reason.
            name: evaluation.capability,
            allowed: evaluation.allowed,
            reason: evaluation.reason,
          },
          policy:
            detected.tier === "CRITICAL"
              ? "CRITICAL: strong authority + explicit confirmation + receipt. " +
                "This lane (DEMO OWNER CONTEXT, no verified owner identity) " +
                "cannot satisfy strong authority."
              : "HIGH: explicit authorization required. This lane cannot " +
                "grant it.",
          authorityNote:
            "DEMO OWNER CONTEXT: the seeded demo actor, treated as " +
            "controller by a hard-coded demo mapping. No owner identity " +
            "was verified; nothing here may back a production " +
            "authorization decision.",
        });
        return NextResponse.json(
          {
            ...ctx.responseLabel(),
            ok: false,
            code: "consequence_refused",
            tier: detected.tier,
            category: detected.category,
            reason: detected.reason,
            // Authority-UX lane: the friction this tier demands, so the
            // refusal states what authorization would be required.
            friction: frictionForTier(detected.tier),
            receipt,
            chain: ctx.auditView(),
          },
          { status: 403 },
        );
      }
      return NextResponse.json(
        {
          ...ctx.responseLabel(),
          ok: false,
          error: "Not an understood command.",
          hint: "Try: Put decks first. Hide fences. Show pergolas. Add patios. Correct phone to +1 555 123 4567. Revert phone correction.",
        },
        { status: 400 },
      );
    }
    // Canonicalize through the same parser the approve stage uses, so the
    // patch digest binds exactly the command the approval would apply.
    let command: OwnerCommand;
    try {
      command = parseOwnerCommand(proposal.command);
    } catch {
      return NextResponse.json(
        { ...ctx.responseLabel(), ok: false, error: "Not an understood command." },
        { status: 400 },
      );
    }
    // Capability impact is a pure evaluation through the OwnerContext
    // seam: it performs no mutation and writes nothing.
    const evaluation = await ctx.evaluateCapability(objectId, "owner.correct-fact");
    const actor = ctx.actor;
    const capabilityImpact = ctx.capabilityImpactLine(evaluation);
    const { ids, names } = knownServices(objectId);
    const preview = buildPatchPreview(objectId, command, ids, names, capabilityImpact);
    const tier = commandConsequenceTier(command);
    return NextResponse.json({
      ...ctx.responseLabel(),
      ok: true,
      tenantId: ctx.tenantId,
      actorDisclosure: actor.disclosure,
      proposal: { command, summary: proposal.summary },
      preview,
      tier,
      // Product-directive stamping (Nolan 2026-09-25): the four-tier scale
      // folds onto the LOW/MEDIUM/HIGH product tiers (HIGH+CRITICAL -> HIGH).
      productTier: foldLegacyTier(tier),
      // Owner-facing language law: LOW speaks as "Change the website"
      // (presentation intent, projection only); MEDIUM speaks as "Update
      // the business" (knowledge transition, all projections follow).
      changeKind: changeKindForTier(tier),
      consequenceNote: consequenceNoteFor(tier),
      // Authority-UX lane: consequence classification + friction stamped
      // on the proposal record (renderer reads it, never invents it).
      classification: classificationRecord(command),
      digests: {
        baseStateDigest: ownerStateDigest(objectId),
        baseViewDigest: buildViewDigest(ownerProjection, objectId),
        patchDigest: patchDigestOf(command),
      },
      chain: ctx.auditView(),
    });
  }

  // Stage 2: approve a previously proposed typed command. This is the only
  // stage that mutates the owner store.
  if (stage === "approve") {
    const rawCommand = record.command;
    const presentedBase =
      typeof record.baseStateDigest === "string" ? record.baseStateDigest : "";
    const presentedView =
      typeof record.baseViewDigest === "string" ? record.baseViewDigest : "";
    const presentedPatch =
      typeof record.patchDigest === "string" ? record.patchDigest : "";
    // The approval must echo all three preview digests: base owner state,
    // base composed build view, and patch. Any missing digest is a refusal:
    // an approval that is not bound to a previewed proposal is refused.
    const hex64 = (s: string) => /^[0-9a-f]{64}$/.test(s);
    if (!hex64(presentedBase) || !hex64(presentedView) || !hex64(presentedPatch)) {
      return NextResponse.json(
        {
          ...ctx.responseLabel(),
          ok: false,
          code: "approval_not_bound",
          error:
            "Approve the proposal you previewed: echo back its baseStateDigest, " +
            "baseViewDigest, and patchDigest. " +
            "An approval that is not bound to a previewed proposal is refused.",
        },
        { status: 400 },
      );
    }
    let command: OwnerCommand;
    try {
      command = parseOwnerCommand(rawCommand);
    } catch (err) {
      const message = err instanceof OwnerCommandError ? err.message : "Could not apply the change.";
      return NextResponse.json({ ...ctx.responseLabel(), ok: false, error: message }, { status: 400 });
    }
    // Bind the command to the previewed proposal: a different command than
    // the one previewed is refused, nothing written.
    if (patchDigestOf(command) !== presentedPatch) {
      return NextResponse.json(
        {
          ...ctx.responseLabel(),
          ok: false,
          code: "patch_mismatch",
          error:
            "The command does not match the previewed proposal (patch digest differs). " +
            "Propose again and approve the proposal you previewed.",
        },
        { status: 400 },
      );
    }
    // STALE PROPOSAL: the base moved since the proposal was drafted. Either
    // the owner state changed (another write landed) or the composed build
    // view changed (a source refresh moved the rendered build under the
    // unchanged owner journal). Either way the approval's binding is broken:
    // refuse, write nothing, name what moved.
    const currentBase = ownerStateDigest(objectId);
    const currentView = buildViewDigest(ownerProjection, objectId);
    const stateMoved = presentedBase !== currentBase;
    const viewMoved = presentedView !== currentView;
    if (stateMoved || viewMoved) {
      const moved = stateMoved
        ? "the owner state changed since this proposal was drafted."
        : "the build view (source refresh under the override) changed since this proposal was drafted.";
      return NextResponse.json(
        {
          ...ctx.responseLabel(),
          ok: false,
          code: "stale_proposal",
          error:
            "STALE PROPOSAL: " +
            moved +
            " Nothing was written. Propose again against the current state.",
          presentedBaseStateDigest: presentedBase,
          currentBaseStateDigest: currentBase,
          presentedBaseViewDigest: presentedView,
          currentBaseViewDigest: currentView,
        },
        { status: 409 },
      );
    }
    try {
      // SESSION -> PING IDENTITY -> CONTROL RELATIONSHIP -> CAPABILITY.
      // The verdict is the only gate to the apply step: authentication
      // alone never grants mutation. Denied -> 403, nothing written.
      // The OwnerContext is required on every mutation: the actor is always
      // the seeded demo actor, labeled DEMO OWNER CONTEXT.
      const evaluation = await ctx.evaluateCapability(objectId, "owner.correct-fact");
      const audit = ctx.auditView();
      const actor = ctx.actor;
      console.info(
        "[fyd-owner-audit]",
        JSON.stringify({ objectId, command: command.type, tenantId: ctx.tenantId, ...audit }),
      );
      if (!evaluation.allowed) {
        return NextResponse.json(
          {
            ...ctx.responseLabel(),
            ok: false,
            code: "capability_denied",
            error: "Capability denied: " + evaluation.reason,
            chain: audit,
          },
          { status: 403 },
        );
      }
      const { ids, names } = knownServices(objectId);
      // Contact corrections and confirmations need two things only the
      // server can attach honestly: (1) the SOURCE's current value, read
      // from the raw projection (overlay off) at approval time, so the
      // record keeps SOURCE SAYS X even if the source changes later (a
      // confirmation records it for drift detection); (2) the authority
      // label the correction is recorded under. In demo mode this is the
      // seeded demo actor from the OwnerContext: an explicit non-identity,
      // never a verified identity. The chain audit above labels it demo
      // scaffolding; this field is the seam where real owner identity
      // will attach.
      let opts: { sourceValue?: string | null; actorLabel?: string } | undefined;
      if (command.type === "set-contact-field" || command.type === "confirm-contact-field") {
        let sourceValue: string | null = null;
        try {
          const rawGraph = getPingObjectGraphSync(objectId, { ownerOverlay: false }).graph;
          const business = findBusinessObject(rawGraph);
          if (business) sourceValue = rawFieldValue(business, command.field);
        } catch {
          sourceValue = null;
        }
        opts = {
          sourceValue,
          actorLabel: actor.label,
        };
      }
      // PROPOSE/APPLY RULE -> EVENT -> PROJECTION: the apply appends one
      // provenance-backed event to the object's log and the read model
      // re-projects from the log.
      const overrides = applyOwnerCommand(objectId, command, ids, names, opts);
      const approval = buildBoundApproval({
        tenantId: ctx.tenantId,
        actor,
        baseStateDigest: presentedBase,
        baseViewDigest: presentedView,
        patchDigest: presentedPatch,
        eventId: lastEventId(objectId),
        resultDigest: digestOf(overrides),
      });
      const refreshedProjection = getVerifiedPublicProjectionSync(objectId, "owner");
      const view = loadObjectView(refreshedProjection, objectId);
      // Fast proposal/undo for LOW (reversible presentation) changes: the
      // exact inverse command, pre-bound to the POST-APPLY digests, so the
      // owner can reverse a website change in one approve call. If the
      // state moved since, the approve stage's digest checks refuse it
      // safely. MEDIUM changes get no undo: assertions are superseded by
      // newer assertions, and corrections revert through
      // revert-contact-field.
      const tier = commandConsequenceTier(command);
      const inverse = tier === "LOW" ? invertOwnerCommand(command) : null;
      const undo =
        inverse === null
          ? undefined
          : {
              command: inverse,
              summary: describeCommand(inverse, names),
              baseStateDigest: ownerStateDigest(objectId),
              baseViewDigest: buildViewDigest(ownerProjection, objectId),
              patchDigest: patchDigestOf(inverse),
            };
      return NextResponse.json({
        ...ctx.responseLabel(),
        ok: true,
        view,
        history: overrides.history,
        approval,
        tier,
        changeKind: changeKindForTier(tier),
        // Authority-UX lane: the decision record carries the same
        // classification the proposal carried, for WHY THIS and audit.
        classification: classificationRecord(command),
        undo,
        chain: audit,
      });
    } catch (err) {
      const message = err instanceof OwnerCommandError ? err.message : "Could not apply the change.";
      return NextResponse.json({ ...ctx.responseLabel(), ok: false, error: message }, { status: 400 });
    }
  }

  return NextResponse.json(
    { ...ctx.responseLabel(), ok: false, error: 'Specify stage "propose" or stage "approve".' },
    { status: 400 },
  );
}
