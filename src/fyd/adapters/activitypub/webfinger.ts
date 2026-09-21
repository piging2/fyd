/**
 * WebFinger resolution for acct: URIs, via Fedify.
 *
 * Fedify owns the WebFinger (RFC 7033) plumbing: this module only maps the
 * resource descriptor to the adapter's ResolvedRemoteActor shape and fetches
 * the actor document for its inbox URI. The actor document fetch is plain
 * fetch plus JSON parsing (a single property read: "inbox"); that keeps the
 * declared dependency surface to @fedify/fedify only.
 */

import { createFederation, MemoryKvStore } from "@fedify/fedify";
import { ActivityPubAdapterError, ResolvedRemoteActor } from "./types";

const ACCT_PATTERN = /^acct:([^@\s]+)@([^@\s]+)$/;

type Federation = ReturnType<typeof createFederation>;

let federation: Federation | null = null;

function getContext() {
  if (!federation) {
    federation = createFederation({ kv: new MemoryKvStore() });
  }
  // A client-only context: no inbound routes are registered, this context
  // exists solely for outbound lookups.
  return federation.createContext(new URL("https://localhost/"), undefined);
}

/**
 * Resolve "acct:user@host" to a remote actor. Throws ActivityPubAdapterError
 * with kind "invalid_intent" (bad acct form), "webfinger_not_found",
 * "actor_unresolvable", or "network_error".
 */
export async function resolveAcct(
  acct: string,
  options?: { timeoutMs?: number },
): Promise<ResolvedRemoteActor> {
  const trimmed = acct.trim();
  const match = ACCT_PATTERN.exec(trimmed);
  if (!match) {
    throw new ActivityPubAdapterError(
      "invalid_intent",
      `expected an acct: URI of the form acct:user@host, got ${JSON.stringify(acct)}`,
    );
  }
  const [, user, host] = match;
  const timeoutMs = options?.timeoutMs ?? 15000;

  let descriptor;
  try {
    descriptor = await getContext().lookupWebFinger(`acct:${user}@${host}`);
  } catch (error) {
    throw new ActivityPubAdapterError(
      "network_error",
      `WebFinger lookup failed for acct:${user}@${host}`,
      String(error),
    );
  }
  if (!descriptor) {
    throw new ActivityPubAdapterError(
      "webfinger_not_found",
      `no WebFinger descriptor for acct:${user}@${host}`,
    );
  }
  const selfLink = (descriptor.links ?? []).find(
    (link) => link.rel === "self" && (link.type ?? "").includes("activity+json") && link.href,
  );
  if (!selfLink?.href) {
    throw new ActivityPubAdapterError(
      "actor_unresolvable",
      `WebFinger descriptor for acct:${user}@${host} has no activity+json self link`,
    );
  }
  const actorUri = selfLink.href;

  let actorDoc: unknown;
  try {
    const response = await fetch(actorUri, {
      headers: { accept: "application/activity+json, application/ld+json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new ActivityPubAdapterError(
        "actor_unresolvable",
        `actor document fetch failed`,
        `GET ${actorUri} -> HTTP ${response.status}`,
        response.status,
      );
    }
    actorDoc = await response.json();
  } catch (error) {
    if (error instanceof ActivityPubAdapterError) throw error;
    throw new ActivityPubAdapterError(
      "network_error",
      `actor document fetch failed for ${actorUri}`,
      String(error),
    );
  }

  const inbox =
    actorDoc && typeof actorDoc === "object" && "inbox" in actorDoc
      ? (actorDoc as { inbox?: unknown }).inbox
      : undefined;
  if (typeof inbox !== "string" || inbox.length === 0) {
    throw new ActivityPubAdapterError(
      "actor_unresolvable",
      `actor document ${actorUri} carries no inbox URI`,
    );
  }
  return { acct: `${user}@${host}`, actorUri, inboxUri: inbox };
}
