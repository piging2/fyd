/**
 * /api/fyd/ads/dashboards
 *
 * The read API for the FYD objects economic loop dashboards
 * (lane B6; DESIGN.md component G). GET returns exactly one view,
 * chosen by the caller's server-resolved tenant:
 * - the loop's controlled publisher (loop-demo) gets the publisher
 *   dashboard: its slots, consent state, counted delivery, and the
 *   excluded counts by classification;
 * - the loop's advertiser (ping-fyd, PING itself) gets the
 *   advertiser dashboard: the house campaign's state, today's
 *   counted delivery against its caps, per-day history, and recent
 *   decision outcomes;
 * - any other tenant is refused (403). There is no all-tenants view
 *   in v1 (DESIGN.md security section).
 *
 * Trust law, following the B5 opt-in route's pattern exactly:
 * - The dashboards are part of the sponsored path, so the loop
 *   enable flag gates them: flag off -> 404, nothing read.
 * - Identity is resolved SERVER-SIDE from the authenticated
 *   fyd_session cookie through the tenant binding resolver (the
 *   same injectable resolver the opt-in route uses; the default is
 *   unbound, so no cookie can assert a tenancy the system never
 *   granted). No session -> 401. The request carries no body and
 *   no tenant parameter: a caller cannot ask for another tenant's
 *   dashboard.
 * - The handlers are read-only: they build the dashboard read
 *   models from the stores and the ledger read API and write
 *   nothing. Every displayed number comes from the ledger read
 *   API, attested by the reconciliation stamp in the payload.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  buildAdvertiserDashboard,
  buildPublisherDashboard,
  LOOP_ADVERTISER_TENANT_ID,
  type AdvertiserDashboard,
  type PublisherDashboard,
} from "@/fyd/ads/dashboards";
import type { AdsEventLedger } from "@/fyd/ads/event-ledger";
import { isAdsLoopEnabled, LOOP_PUBLISHER_TENANT_ID } from "@/fyd/ads/policy";
import {
  resolveAdsOptInActor,
  type AdsOptInRouteDeps,
} from "@/fyd/ads/opt-in-route";


export interface AdsDashboardRouteDeps extends AdsOptInRouteDeps {
  /** Ledger override (tests); default the canonical ledger. */
  ledger?: AdsEventLedger;
  /** Clock override (tests); default Date.now. */
  now?: () => number;
}

function errorJson(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export function createAdsDashboardGetHandler(
  deps: AdsDashboardRouteDeps = {},
) {
  return async function GET(request: NextRequest): Promise<NextResponse> {
    if (!isAdsLoopEnabled(deps.env)) {
      return errorJson(
        404,
        "ads-loop-disabled",
        "The FYD ads loop is not enabled.",
      );
    }
    const actor = resolveAdsOptInActor(request, deps);
    if (actor === null) {
      return errorJson(
        401,
        "dashboard-session-required",
        "A session is required for the loop dashboards.",
      );
    }
    if (actor.tenantId === LOOP_PUBLISHER_TENANT_ID) {
      const dashboard: PublisherDashboard = buildPublisherDashboard({
        ledger: deps.ledger,
        now: deps.now,
      });
      return NextResponse.json(
        { ok: true, view: dashboard.view, dashboard },
        { status: 200 },
      );
    }
    if (actor.tenantId === LOOP_ADVERTISER_TENANT_ID) {
      const dashboard: AdvertiserDashboard = buildAdvertiserDashboard({
        ledger: deps.ledger,
        now: deps.now,
      });
      return NextResponse.json(
        { ok: true, view: dashboard.view, dashboard },
        { status: 200 },
      );
    }
    return errorJson(
      403,
      "not-a-loop-tenant",
      "The loop dashboards serve the loop's publisher and advertiser only.",
    );
  };
}

