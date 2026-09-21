/**
 * Map PingReaderError (and unexpected errors) to JSON error responses for
 * the /api/practice BFF routes. The UI renders these as ERROR states with
 * retry; nothing is faked when the gateway is unavailable.
 */

import { NextResponse } from "next/server";
import { PingReaderError } from "@/lib/ping/ping-object-reader";

export function readerErrorResponse(err: unknown): NextResponse {
  if (err instanceof PingReaderError) {
    return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
  console.error("[practice-bff] unexpected error", err);
  return NextResponse.json(
    { error: { code: "INTERNAL", message: "Unexpected practice BFF error. Check server logs." } },
    { status: 500 },
  );
}
