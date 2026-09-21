/**
 * POST /api/fyd/objects/[objectId]/overrides
 *
 * Owner intent as a two-step loop: PROPOSE then APPROVE.
 *
 *   { stage: "propose", text: "Put decks first" }
 *     -> interprets the free text into a typed OwnerCommand and returns a
 *        proposal { command, summary }. NOTHING IS WRITTEN at this stage.
 *
 *   { stage: "approve", command: { type: "move-service", ... } }
 *     -> validates, applies, and returns the refreshed public ObjectView
 *        plus the updated human-language history. Only this stage mutates.
 *
 * DEMO/DEV ONLY: there is no production authentication on this route. It is
 * the seam where real owner auth will attach; until that lane exists, the
 * Manage surface labels every session DEV/DEMO and this route must not be
 * treated as a production owner API.
 *
 * The approve stage enforces the owner-core chain:
 *   SESSION -> PING IDENTITY -> CONTROL RELATIONSHIP -> CAPABILITY
 *     -> PROPOSE/APPLY RULE -> EVENT -> PROJECTION.
 * resolveOwnerCorrectionChain (src/fyd/owner-mode/demo-chain.ts) evaluates
 * the chain; a denied owner.correct-fact verdict returns 403 and nothing
 * is written. The session identity is recorded for audit only:
 * authentication alone NEVER grants mutation. The demo actor path is kept
 * but labeled truthfully as demo scaffolding in the chain audit trail,
 * which is returned with every approve response and logged server-side.
 *
 * Failures are typed 400s; nothing is written on validation failure.
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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ objectId: string }> },
) {
  const { objectId } = await params;
  if (!loadObjectView(objectId)) {
    return NextResponse.json({ ok: false, error: "Unknown object." }, { status: 404 });
  }

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const stage = (body as { stage?: unknown } | null)?.stage;

  // Stage 1: interpret only. Never writes.
  if (stage === "propose") {
    const text = (body as { text?: unknown } | null)?.text;
    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ ok: false, error: "Describe the change in plain language." }, { status: 400 });
    }
    const proposal = interpretTextCommand(text, objectId);
    if (!proposal) {
      return NextResponse.json(
        {
          ok: false,
          error: "Not an understood command.",
          hint: "Try: Put decks first. Hide fences. Show pergolas. Add patios. Correct phone to +1 555 123 4567. Revert phone correction.",
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ ok: true, proposal });
  }

  // Stage 2: approve a previously proposed typed command. This is the only
  // stage that mutates the owner store.
  if (stage === "approve") {
    const rawCommand = (body as { command?: unknown } | null)?.command;
    try {
      const cmd = parseOwnerCommand(rawCommand);
      // SESSION -> PING IDENTITY -> CONTROL RELATIONSHIP -> CAPABILITY.
      // The verdict is the only gate to the apply step: authentication
      // alone never grants mutation. Denied -> 403, nothing written.
      const chain = await resolveOwnerCorrectionChain(objectId);
      const audit = chainAuditView(chain);
      console.info(
        "[fyd-owner-audit]",
        JSON.stringify({ objectId, command: cmd.type, ...audit }),
      );
      if (!chain.verdict.allowed) {
        return NextResponse.json(
          {
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
      if (cmd.type === "set-contact-field") {
        let sourceValue: string | null = null;
        try {
          const rawGraph = getPingObjectGraphSync(objectId, { ownerOverlay: false }).graph;
          const business = findBusinessObject(rawGraph);
          if (business) sourceValue = rawFieldValue(business, cmd.field);
        } catch {
          sourceValue = null;
        }
        opts = {
          sourceValue,
          actorLabel: chain.actor.label,
        };
      }
      // PROPOSE/APPLY RULE -> EVENT -> PROJECTION: the apply appends one
      // provenance-backed event to the object's log and the read model
      // re-projects from the log.
      const overrides = applyOwnerCommand(objectId, cmd, ids, names, opts);
      const view = loadObjectView(objectId);
      return NextResponse.json({
        ok: true,
        view,
        history: overrides.history,
        chain: audit,
      });
    } catch (err) {
      const message = err instanceof OwnerCommandError ? err.message : "Could not apply the change.";
      return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
  }

  return NextResponse.json(
    { ok: false, error: 'Specify stage "propose" or stage "approve".' },
    { status: 400 },
  );
}
