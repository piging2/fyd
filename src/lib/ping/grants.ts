/**
 * FYD user-facing grant authority: who may do what to whose site.
 *
 * This is a USER-FACING grant authority (which viewer may do Y to whose
 * object), not the PING executor CapabilityAuthority (which worker may run
 * X). Confusing the two would be an architectural error, so this module
 * does not import the executor authority.
 *
 * Grant shape follows the ATProto permission-pattern harvest:
 * resource-scoped strings, attenuation by default (a grant on one resource
 * never implies another), and human-readable permission sets that expand to
 * exact granular grants at consent time.
 */

import type { FydGrant } from "./types";

/** Schemas whose objects are site-capable (an FYD site can be generated for them). */
export function isSiteCapableSchema(schema: string): boolean {
  return schema === "ping.social.business@1" || schema === "ping.social.organization@1";
}

/**
 * The exact granular grants behind the human-readable "Help maintain my
 * site" bundle. site.propose never implies site.publish: agents draft site
 * patches, the owner publishes them by approving the exact digest.
 */
export const MAINTAIN_SITE_GRANTS: readonly FydGrant[] = [
  "site.read",
  "site.propose",
  "object.reference",
];

export interface GrantSubject {
  viewerId: string | null;
  /** Controlling identity of the target object. */
  controllerId: string;
  /** True when the target object is site-capable. */
  isSite: boolean;
}

/**
 * Deterministic grants for one viewer on one target. Pure function.
 * - Everyone: object.reference (public reads flow through the BFF).
 * - Controller of a site-capable object: the maintain_site bundle.
 * Agents NEVER receive publish/message/purchase/advertise/provider/mutate.
 */
export function grantsForViewer(subject: GrantSubject): FydGrant[] {
  const grants: FydGrant[] = ["object.reference"];
  if (subject.isSite && subject.viewerId && subject.viewerId === subject.controllerId) {
    grants.push(...MAINTAIN_SITE_GRANTS);
  }
  return [...new Set(grants)];
}
