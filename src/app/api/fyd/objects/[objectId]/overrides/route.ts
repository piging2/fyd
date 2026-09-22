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
 * TenantContext is constructed server-side from the route param via
 * requireTenantContext. Any body-supplied tenant identity (siteId /
 * tenantId / tenant keys) that disagrees with the route tenant is REFUSED
 * with 400 tenant_mismatch. A tenant mismatch never serves another
 * tenant's object.
 *
 * DEMO/DEV ONLY: there is no production authentication on this route. It is
 * the seam where real owner auth will attach; until that lane exists, every
 * response carries demoOwnerContext: true and the actor disclosure, and the
 * Manage surface labels every session DEV/DEMO. This route must not be
 * treated as a production owner API.
 *
 * The approve stage enforces the owner-core chain:
 *   SESSION -> PING IDENTITY -> CONTROL RELATIONSHIP -> CAPABILITY
 *     -> PROPOSE/APPLY RULE -> EVENT -> PROJECTION.
 * resolveOwnerCorrectionChain (src/fyd/owner-mode/demo-chain.ts) evaluates
 * the chain; a denied owner.correct-fact verdict returns 403 and nothing
 * is written. The ActorContext is required on every mutation: it is always
 * the seeded demo actor, labeled as DEMO OWNER CONTEXT. Authentication
 * alone NEVER grants mutation.
 *
 * Failures are typed 400s/409s/403s; nothing is written on failure.
 */

import { NextRequest, NextResponse } from "next/server";
import { loadObjectView, knownServices } from "@/fyd/object/view";
import { interpretTextCommand } from "@/fyd/object/commands";
import {
  applyOwnerCommand,
  parseOwnerCommand,
  OwnerCommandError,
} from "@/fyd/object/owner-store";
import { getPingObjectGraphSync } from "@/fyd/data/ping-object-source";
import { findBusinessObject, rawFieldValue } from "@/fyd/object/owner-overlay";
import {
  chainAuditView,
  resolveOwnerCorrectionChain,
} from "@/fyd/owner-mode/demo-chain";
import {
  requireTenantContext,
  TenantContextError,
} from "@/fyd/tenant/tenant-context";
import type { OwnerCommand } from "@/fyd/object/types";
import {
  buildBoundApproval,
  buildPatchPreview,
  buildViewDigest,
  demoActorContext,
  digestOf,
  lastEventId,
  ownerStateDigest,
  patchDigestOf,
} from "./patch-loop";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Body keys that claim a tenant identity. Only the route path may do that. */
const TENANT_CLAIM_KEYS = ["siteId", "tenantId", "tenant"] as const;

/**
 * Every JSON response from this route, success or error, carries the demo
 * owner-context label. In demo mode the actor is seeded server-side and no
 * owner identity is verified: the label is the honesty mechanism, not a
 * decorative banner, so it must be impossible to get a response from this
 * route that does not identify the demo context.
 */
function demoLabel() {
  return {
    demoOwnerContext: true as const,
    demoNote:
      "DEMO OWNER CONTEXT: mutations on this route run as a seeded demo " +
      "actor. No owner identity was verified. Not a production owner API.",
  };
}

function tenantMismatchResponse(tenantId: string, key: string, claimed: string) {
  return NextResponse.json(
    {
      ...demoLabel(),
      ok: false,
      code: "tenant_mismatch",
      error:
        "Tenant identity comes from the request route, not the request body: " +
        "the body claimed tenant \"" +
        claimed +
        "\" under key \"" +
        key +
        "\" while the route serves tenant \"" +
        tenantId +
        "\". The request was refused; nothing was served or written for the claimed tenant.",
      tenantId,
      rejectedKey: key,
    },
    { status: 400 },
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ objectId: string }> },
) {
  const { objectId } = await params;

  // G4: the tenant comes from the trusted route path. The object id IS the
  // site id (listObjectIds serves the PING-backed site projections), so the
  // TenantContext is constructed server-side here, before any I/O.
  let tenantId: string;
  try {
    tenantId = requireTenantContext({ tenantId: objectId });
  } catch (err) {
    if (err instanceof TenantContextError) {
      return NextResponse.json(
        {
          ...demoLabel(),
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

  if (!loadObjectView(objectId)) {
    return NextResponse.json({ ...demoLabel(), ok: false, error: "Unknown object." }, { status: 404 });
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
    if (typeof claimed === "string" && claimed.trim().length > 0 && claimed.trim() !== tenantId) {
      return tenantMismatchResponse(tenantId, key, claimed.trim());
    }
  }

  const stage = record.stage;

  // Stage 1: interpret only. Never writes.
  if (stage === "propose") {
    const text = record.text;
    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ ...demoLabel(), ok: false, error: "Describe the change in plain language." }, { status: 400 });
    }
    const proposal = interpretTextCommand(text, objectId);
    if (!proposal) {
      return NextResponse.json(
        {
          ...demoLabel(),
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
        { ...demoLabel(), ok: false, error: "Not an understood command." },
        { status: 400 },
      );
    }
    // Capability impact is a pure evaluation: the chain performs no
    // mutation and writes nothing.
    const chain = await resolveOwnerCorrectionChain(objectId);
    const actor = demoActorContext(chain.actor.id, chain.actor.label);
    const capabilityImpact =
      "Capability " +
      chain.verdict.capability +
      ": " +
      (chain.verdict.allowed ? "ALLOWED" : "DENIED") +
      " under DEMO OWNER CONTEXT. " +
      chain.verdict.reason;
    const { ids, names } = knownServices(objectId);
    const preview = buildPatchPreview(objectId, command, ids, names, capabilityImpact);
    return NextResponse.json({
      ...demoLabel(),
      ok: true,
      tenantId,
      actorDisclosure: actor.disclosure,
      proposal: { command, summary: proposal.summary },
      preview,
      digests: {
        baseStateDigest: ownerStateDigest(objectId),
        baseViewDigest: buildViewDigest(objectId),
        patchDigest: patchDigestOf(command),
      },
      chain: chainAuditView(chain),
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
          ...demoLabel(),
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
      return NextResponse.json({ ...demoLabel(), ok: false, error: message }, { status: 400 });
    }
    // Bind the command to the previewed proposal: a different command than
    // the one previewed is refused, nothing written.
    if (patchDigestOf(command) !== presentedPatch) {
      return NextResponse.json(
        {
          ...demoLabel(),
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
    const currentView = buildViewDigest(objectId);
    const stateMoved = presentedBase !== currentBase;
    const viewMoved = presentedView !== currentView;
    if (stateMoved || viewMoved) {
      const moved = stateMoved
        ? "the owner state changed since this proposal was drafted."
        : "the build view (source refresh under the override) changed since this proposal was drafted.";
      return NextResponse.json(
        {
          ...demoLabel(),
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
      // The ActorContext is required on every mutation: it is always the
      // seeded demo actor, labeled DEMO OWNER CONTEXT.
      const chain = await resolveOwnerCorrectionChain(objectId);
      const audit = chainAuditView(chain);
      const actor = demoActorContext(chain.actor.id, chain.actor.label);
      console.info(
        "[fyd-owner-audit]",
        JSON.stringify({ objectId, command: command.type, tenantId, ...audit }),
      );
      if (!chain.verdict.allowed) {
        return NextResponse.json(
          {
            ...demoLabel(),
            ok: false,
            code: "capability_denied",
            error: "Capability denied: " + chain.verdict.reason,
            chain: audit,
          },
          { status: 403 },
        );
      }
      const { ids, names } = knownServices(objectId);
      // Contact corrections need two things only the server can attach
      // honestly: (1) the SOURCE's current value, read from the raw
      // projection (overlay off) at approval time, so the record keeps
      // SOURCE SAYS X even if the source changes later; (2) the authority
      // label the correction is recorded under. In demo mode this is the
      // seeded demo actor from the chain: an explicit non-identity, never
      // a verified identity. The chain audit above labels it demo
      // scaffolding; this field is the seam where real owner identity
      // will attach.
      let opts: { sourceValue?: string | null; actorLabel?: string } | undefined;
      if (command.type === "set-contact-field") {
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
        tenantId,
        actor,
        baseStateDigest: presentedBase,
        baseViewDigest: presentedView,
        patchDigest: presentedPatch,
        eventId: lastEventId(objectId),
        resultDigest: digestOf(overrides),
      });
      const view = loadObjectView(objectId);
      return NextResponse.json({
        ...demoLabel(),
        ok: true,
        view,
        history: overrides.history,
        approval,
        chain: audit,
      });
    } catch (err) {
      const message = err instanceof OwnerCommandError ? err.message : "Could not apply the change.";
      return NextResponse.json({ ...demoLabel(), ok: false, error: message }, { status: 400 });
    }
  }

  return NextResponse.json(
    { ...demoLabel(), ok: false, error: 'Specify stage "propose" or stage "approve".' },
    { status: 400 },
  );
}
