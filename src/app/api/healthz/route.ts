import { NextResponse } from "next/server";

/**
 * GET /healthz — liveness. No dependencies: answers whether this
 * process is alive. Always 200 when the server is up.
 */
export async function GET() {
  return NextResponse.json(
    { ok: true, service: "fyd", at: new Date().toISOString() },
    { status: 200 },
  );
}
