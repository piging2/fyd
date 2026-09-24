import { NextResponse } from "next/server";
import { journalReadiness } from "@/fyd/customize/server";

/**
 * GET /readyz — readiness. Runs the journal preflight (gateway reachable
 * + live-derived identity marker matches). 200 when the write path can
 * serve owner actions, 503 with the reason when it cannot.
 */
export async function GET() {
  const probe = await journalReadiness();
  if (probe.ready) {
    return NextResponse.json(
      { ok: true, ready: true, service: "fyd", at: new Date().toISOString() },
      { status: 200 },
    );
  }
  return NextResponse.json(
    {
      ok: false,
      ready: false,
      service: "fyd",
      reason: probe.reason ?? "journal not ready",
      at: new Date().toISOString(),
    },
    { status: 503 },
  );
}
