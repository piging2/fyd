/**
 * GET /api/fyd/inquiry/inbox — owner inbox (TEST PLANE ONLY).
 *
 * Caller-key authenticated + tenant-entitled via the operator-provisioned
 * registry (fail closed: unknown/missing key or unreadable registry ->
 * deny, zero records). Contact details ARE returned here because this
 * endpoint is owner-only; it is never public. Isolated to the test
 * tenant(s); never touches the production journal or stores.
 *
 * Query: ?siteId=<isolated-tenant>
 * Header: x-mc-caller-key: <operator-provisioned key>
 */

import { NextRequest, NextResponse } from "next/server";
import { listOwnerInquiries } from "@/fyd/owner-mode/inquiry-intake";
import {
  isolatedPrivateDir,
  isolatedSiteAllowlist,
  loadIsolatedRegistry,
} from "../isolated";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get("siteId") ?? "";
  if (!isolatedSiteAllowlist().includes(siteId)) {
    return NextResponse.json(
      {
        ok: false,
        code: "site_not_enabled",
        reason: "This test-plane inbox is not enabled for that site.",
      },
      { status: 403 },
    );
  }

  const callerKey = req.headers.get("x-mc-caller-key");
  const result = listOwnerInquiries({
    callerKey,
    siteId,
    privateDir: isolatedPrivateDir(),
    loadRegistry: loadIsolatedRegistry,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, code: result.code, reason: result.reason },
      { status: result.status },
    );
  }

  return NextResponse.json({ ok: true, inquiries: result.inquiries });
}
