/**
 * FYD follow intent -> ActivityPub Follow activity mapping.
 *
 * Follow semantics come from src/lib/ping/action-planner.ts:
 * - follow/unfollow apply to identity-backed objects only (profile, person,
 *   business, organization, agent), never to content objects, and never
 *   to self.
 *
 * The planner enforces those rules for the UI; this mapper re-enforces them
 * at the provider boundary so a malformed or stale intent can never become
 * a signed Follow. Mapping is pure and deterministic: same inputs always
 * produce the same activity document (id factory and clock are injectable).
 */

import {
  ActivityIdFactory,
  ActivityPubAdapterError,
  Clock,
  FollowActivity,
  FollowIntent,
  ResolvedRemoteActor,
} from "./types";

const AS2_CONTEXT = "https://www.w3.org/ns/activitystreams";

function defaultActivityId(localActorUri: string, hint: "follow" | "undo"): string {
  return `${localActorUri}#${hint}-${crypto.randomUUID()}`;
}

function defaultClock(): Date {
  return new Date();
}

export interface BuildFollowOptions {
  intent: FollowIntent;
  /** FYD identity's own ActivityPub actor URI (the follower). */
  localActorUri: string;
  /** Remote actor, already resolved via WebFinger (see webfinger.ts). */
  remote: ResolvedRemoteActor;
  newActivityId?: ActivityIdFactory;
  clock?: Clock;
}

/**
 * Compile a FYD follow/unfollow intent into a signed-ready ActivityStreams
 * activity. "follow" becomes a Follow; "unfollow" becomes an Undo wrapping
 * the Follow (matching the planner's active/inactive relationship vocab).
 *
 * Throws ActivityPubAdapterError with kind "invalid_intent" or "self_follow".
 */
export function buildFollowActivity(options: BuildFollowOptions): FollowActivity {
  const { intent, localActorUri, remote } = options;
  const newActivityId = options.newActivityId ?? defaultActivityId;
  const clock = options.clock ?? defaultClock;

  if (intent.kind !== "follow" && intent.kind !== "unfollow") {
    throw new ActivityPubAdapterError(
      "invalid_intent",
      `expected a follow/unfollow intent, got kind ${JSON.stringify(intent.kind)}`,
    );
  }
  if (!intent.target || intent.target.kind !== "identity" || !intent.target.identityId) {
    throw new ActivityPubAdapterError(
      "invalid_intent",
      "follow applies to identity-backed targets only; " +
        `got target ${JSON.stringify(intent.target)}`,
    );
  }
  if (!localActorUri) {
    throw new ActivityPubAdapterError("invalid_intent", "localActorUri is required");
  }
  if (!remote?.actorUri) {
    throw new ActivityPubAdapterError("invalid_intent", "remote actor is not resolved");
  }
  if (localActorUri === remote.actorUri) {
    throw new ActivityPubAdapterError(
      "self_follow",
      `refusing to follow self: ${localActorUri}`,
    );
  }

  const published = clock().toISOString();
  const follow: FollowActivity = {
    "@context": AS2_CONTEXT,
    id: newActivityId(localActorUri, "follow"),
    type: "Follow",
    actor: localActorUri,
    object: remote.actorUri,
    published,
  };

  if (intent.kind === "follow") {
    return follow;
  }
  return {
    "@context": AS2_CONTEXT,
    id: newActivityId(localActorUri, "undo"),
    type: "Undo",
    actor: localActorUri,
    object: follow,
    published,
  };
}
