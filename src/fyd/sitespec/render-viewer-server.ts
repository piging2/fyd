/**
 * LANE-8: server-side render viewer claim resolution. SERVER ONLY.
 *
 * resolveViewerClaim runs once per page request in the server component and
 * the resulting claim is classified by classifyRenderViewer (see
 * ./render-projection.ts). The resolved kind is passed down to client
 * components as data, never re-derived in the browser.
 *
 * Engineer grant: BOTH of these must hold, otherwise engineerGrant is
 * false and the toggle alone grants nothing:
 *   1. the deliberate URL toggle: ?fyd_advanced=1 on the page URL
 *      (the explicit Advanced / Trust / Developer opt-in), and
 *   2. the server-side grant: process.env.FYD_ENGINEER_GRANT === "1".
 *      This is a server-only env var (no NEXT_PUBLIC_ prefix), so it is
 *      never inlined into the client bundle and cannot be set from the
 *      browser. Unset by default: the engineer surface is unreachable
 *      until the operator deliberately enables it.
 *
 * Owner: hasVerifiedOwner() from the owner identity seam. The default
 * bound provider is the explicitly-unverified demo provider, so demo
 * owner mode can NEVER produce the owner class, mirroring the ask-side
 * classifier. A production provider bound via bindIdentityProvider()
 * returns verified: true only after a real verification step.
 */

import { resolveOwnerIdentity } from "@/fyd/owner-mode/owner-identity";
import type { RenderViewerClaim } from "./render-projection";

export interface ViewerSearchParams {
  fyd_advanced?: string | string[];
}

/**
 * Resolve the render viewer claim for this request. Fail closed: any
 * resolution failure yields the anonymous claim (visitor).
 */
export async function resolveViewerClaim(
  searchParams?: ViewerSearchParams,
): Promise<RenderViewerClaim> {
  const toggle = searchParams?.fyd_advanced;
  const toggleOn =
    toggle === "1" || (Array.isArray(toggle) && toggle.includes("1"));
  const serverGrant = process.env.FYD_ENGINEER_GRANT === "1";

  let identityId: string | null = null;
  let verified = false;
  try {
    const identity = await resolveOwnerIdentity();
    if (identity !== null && identity.verified === true) {
      identityId = identity.identityId;
      verified = true;
    }
  } catch {
    identityId = null;
    verified = false;
  }

  return {
    identityId,
    verified,
    engineerGrant: toggleOn && serverGrant,
  };
}
