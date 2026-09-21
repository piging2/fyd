/**
 * Inbox/outbox endpoint stubs with typed errors.
 *
 * postToInbox is the client side: sign a Follow activity and POST it to a
 * remote actor's inbox. localOutboxEndpoint is deliberately a stub: the FYD
 * server runtime that would serve our own actor/inbox/outbox endpoints is
 * not wired yet, so it fails closed with a typed "not_implemented" error
 * instead of pretending to work.
 */

import { ActivityPubAdapterError, FollowActivity } from "./types";
import { SigningKey, signActivityRequest } from "./signing";

export interface InboxDelivery {
  inboxUrl: string;
  status: number;
  bodyExcerpt: string;
}

/**
 * Deliver an activity to a remote inbox. Non-2xx responses become a typed
 * "delivery_failed" error carrying the HTTP status and a body excerpt;
 * transport failures become "network_error".
 */
export async function postToInbox(input: {
  inboxUrl: string;
  activity: FollowActivity;
  key: SigningKey;
  timeoutMs?: number;
}): Promise<InboxDelivery> {
  const signed = await signActivityRequest({
    url: input.inboxUrl,
    activity: input.activity,
    key: input.key,
  });
  let response: Response;
  try {
    response = await fetch(signed, { signal: AbortSignal.timeout(input.timeoutMs ?? 20000) });
  } catch (error) {
    throw new ActivityPubAdapterError(
      "network_error",
      `POST to inbox failed`,
      `${input.inboxUrl}: ${String(error)}`,
    );
  }
  const bodyExcerpt = (await response.text().catch(() => "")).slice(0, 500);
  if (!response.ok) {
    throw new ActivityPubAdapterError(
      "delivery_failed",
      `inbox rejected the activity`,
      `POST ${input.inboxUrl} -> HTTP ${response.status}: ${bodyExcerpt}`,
      response.status,
    );
  }
  return { inboxUrl: input.inboxUrl, status: response.status, bodyExcerpt };
}

/**
 * Local outbox endpoint stub. Fails closed until the FYD server runtime
 * (actor dispatch, key storage, outbox collection) exists.
 */
export function localOutboxEndpoint(): never {
  throw new ActivityPubAdapterError(
    "not_implemented",
    "local outbox endpoint is not wired yet: the FYD server runtime that " +
      "would serve actor/inbox/outbox routes does not exist, so activities " +
      "can only be delivered outbound via postToInbox",
  );
}
