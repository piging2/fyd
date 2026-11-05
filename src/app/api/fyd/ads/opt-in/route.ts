/**
 * /api/fyd/ads/opt-in
 *
 * Route module: exports only the handlers and the allowed route
 * config fields (Next.js route-export law). The implementation
 * lives in @/fyd/ads/opt-in-route; see that module for the trust
 * law and behavior contract.
 */

import {
  createAdsOptInGetHandler,
  createAdsOptInPostHandler,
} from "@/fyd/ads/opt-in-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createAdsOptInGetHandler();
export const POST = createAdsOptInPostHandler();
