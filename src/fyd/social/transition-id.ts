/**
 * Deterministic FYD action identity (absorbed C1 pattern). SERVER ONLY.
 *
 * Mirrors UnifiedEventRuntime.emit: a content-hash ID over canonical bytes,
 * so the same logical action always yields the same ID and a repeated action
 * can be recognized as a duplicate without re-emitting. The generator
 * version is bound into the identity, the same way PING's IdentityAuthority
 * binds constitutional_version.
 *
 * Canonical bytes use the dev envelope serializer (sorted-key recursive
 * JSON, undefined dropped) so the action ID and the signed envelope agree
 * on what "the same action" means.
 */

import { createHash } from "node:crypto";
import { canonicalizeJson } from "@/lib/ping/dev-signer";

export const FYD_SOCIAL_GENERATOR_VERSION = "fyd-social@1";

/** Deterministic SHA-256 hex ID for a logical FYD social action. */
export function fydActionId(action: Record<string, unknown>): string {
  const bytes = canonicalizeJson({
    ...action,
    generator_version: FYD_SOCIAL_GENERATOR_VERSION,
  });
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

/** The canonical action material for a relate (follow/unfollow) action. */
export function relateActionMaterial(input: {
  subject: string;
  predicate: "follows";
  object: string;
  status: "active" | "inactive";
}): Record<string, unknown> {
  return {
    kind: "social.relate",
    subject: input.subject,
    predicate: input.predicate,
    object: input.object,
    status: input.status,
  };
}
