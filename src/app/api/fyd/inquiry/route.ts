/**
 * POST /api/fyd/inquiry — visitor quote-request intake (TEST PLANE ONLY).
 *
 * Isolated path: admits ONLY the configured test tenant(s), against the
 * server-side published catalog, into the isolated journal + isolated
 * tenant-private store. Not connected to the public demo or the
 * production journal (CEO 2026-10-11: no public mutations until
 * authorization is real).
 *
 * Admission rests on server-side validation, the published catalog, and
 * durable rate limits — never on visitor claims. No external sends, ever.
 * The receipt carries NO contact details.
 */

import { NextRequest, NextResponse } from "next/server";
import { intakeInquiry } from "@/fyd/owner-mode/inquiry-intake";
import {
  isolatedPrivateDir,
  isolatedSiteAllowlist,
  withIsolatedJournal,
} from "./isolated";
import { catalogForSite } from "./catalog";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid_body", reason: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const siteId = typeof body.siteId === "string" ? body.siteId : "";
  if (!isolatedSiteAllowlist().includes(siteId)) {
    return NextResponse.json(
      {
        ok: false,
        code: "site_not_enabled",
        reason:
          "This test-plane inquiry route is not enabled for that site. No mutation was attempted.",
      },
      { status: 403 },
    );
  }

  const result = withIsolatedJournal(() =>
    intakeInquiry({
      siteId,
      serviceId: typeof body.serviceId === "string" ? body.serviceId : "",
      visitorName: typeof body.visitorName === "string" ? body.visitorName : "",
      visitorContact:
        typeof body.visitorContact === "string" ? body.visitorContact : "",
      visitorMessage:
        typeof body.visitorMessage === "string" ? body.visitorMessage : "",
      // Closed world: the catalog comes from the server, never the
      // client, and is scoped to the admitted site: one tenant's
      // services are never quotable under another tenant's id.
      knownServices: catalogForSite(siteId),
      ...(typeof body.idempotencyKey === "string"
        ? { idempotencyKey: body.idempotencyKey }
        : {}),
      privateDir: isolatedPrivateDir(),
    }),
  );

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, code: result.code, reason: result.reason },
      { status: result.status },
    );
  }

  // The receipt is proof of acceptance, not a copy of the intake:
  // deliberately NO contact details.
  const r = result.receipt;
  return NextResponse.json({
    ok: true,
    replayed: result.replayed,
    receipt: {
      receiptId: r.receiptId,
      inquiryRef: r.inquiryRef,
      siteId: r.siteId,
      serviceId: r.serviceId,
      serviceLabel: r.serviceLabel,
      receivedAt: r.receivedAt,
    },
  });
}
