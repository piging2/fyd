/**
 * POST /api/fyd/ads/events
 *
 * Route module: exports only the handler and the allowed route
 * config fields (Next.js route-export law). The implementation
 * lives in @/fyd/ads/events-route; see that module for the trust
 * law and behavior contract.
 */

import { createAdsEventsPostHandler } from "@/fyd/ads/events-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createAdsEventsPostHandler();
