/**
 * Ask FYD agent capability boundary.
 *
 * Builds on the user-facing grant authority (lib/ping/grants) and adds the
 * agent-side law: the agent sees only agentGrants, the forbidden effects
 * stripped. Agent suggestions never authorize publishing, messages,
 * purchases, advertising, provider actions, or business-data mutations.
 * The check is fail-closed: unknown grants are denied, not allowed.
 */

import { MAINTAIN_SITE_GRANTS } from "../../lib/ping/grants";
import type { FydGrant } from "../../lib/ping/types";

/**
 * Effects an agent suggestion can NEVER authorize. This list is the
 * enforcement point; agentGrants strips these before the agent sees them.
 */
export const FORBIDDEN_AGENT_EFFECTS: readonly FydGrant[] = [
  "site.publish",
  "message.send",
  "purchase.make",
  "ad.buy",
  "provider.call",
  "business.mutate",
];

/** True when an agent suggestion may authorize this grant. Fail-closed. */
export function canAgentAuthorize(grant: FydGrant): boolean {
  return !FORBIDDEN_AGENT_EFFECTS.includes(grant);
}

/** Throw when an agent path touches a forbidden effect. Defense in depth. */
export function assertAgentEffectAllowed(grant: FydGrant): void {
  if (!canAgentAuthorize(grant)) {
    throw new Error(`Ask FYD agent boundary: '${grant}' is never agent-authorized.`);
  }
}

/** Grants as the agent sees them: forbidden effects stripped, stable order. */
export function agentGrants(grants: FydGrant[]): FydGrant[] {
  return grants.filter(canAgentAuthorize);
}

/** Human-readable permission set shown at consent time. */
export interface PermissionSet {
  id: string;
  title: string;
  summary: string;
  /** Exact granular grants; expansion is closed (nothing more, nothing less). */
  grants: FydGrant[];
}

/**
 * "Help maintain my site": the bundle an owner grants. Expands to site.read,
 * site.propose, and object.reference. It never includes site.publish.
 */
export const PERMISSION_SETS: Record<string, PermissionSet> = {
  maintain_site: {
    id: "maintain_site",
    title: "Help maintain my site",
    summary:
      "Let Ask FYD read your site and draft site changes for your approval. It cannot publish anything on its own.",
    grants: [...MAINTAIN_SITE_GRANTS],
  },
};

/** Expand a permission set to its exact granular grants. Unknown ids throw. */
export function expandPermissionSet(id: string): FydGrant[] {
  const set = PERMISSION_SETS[id];
  if (!set) throw new Error(`capabilities: unknown permission set '${id}'.`);
  return [...set.grants];
}
