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
      const { ids, names } = knownServices(objectId);
      // Contact corrections need two things only the server can attach
      // honestly: (1) the SOURCE's current value, read from the raw
      // projection (overlay off) at approval time, so the record keeps
      // SOURCE SAYS X even if the source changes later; (2) the authority
      // label the correction is recorded under. In demo mode this is the
      // seeded demo actor, explicitly unverified: this field is the seam
      // where real owner identity will attach; it is never a verified
      // identity today.
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
          actorLabel: "Demo Owner (seeded, unverified)",
        };
      }
      const overrides = applyOwnerCommand(objectId, cmd, ids, names, opts);
      const view = loadObjectView(objectId);
      return NextResponse.json({ ok: true, view, history: overrides.history });
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
