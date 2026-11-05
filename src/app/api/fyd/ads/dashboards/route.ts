/**
 * /api/fyd/ads/dashboards
 *
 * Route module: exports only the handler and the allowed route
 * config fields (Next.js route-export law). The implementation
 * lives in @/fyd/ads/dashboards-route; see that module for the
 * trust law and behavior contract.
 */

import { createAdsDashboardGetHandler } from "@/fyd/ads/dashboards-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createAdsDashboardGetHandler();
