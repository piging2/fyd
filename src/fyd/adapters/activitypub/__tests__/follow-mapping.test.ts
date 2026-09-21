/**
 * Follow-intent -> Follow-activity mapping tests.
 *
 * Deterministic and network-free: the activity id factory and the clock are
 * injected, so the same inputs always produce the same document. These tests
 * pin the contract between the action planner's follow semantics and the
 * ActivityPub wire format.
 */

import { buildFollowActivity } from "../follow";
import { ActivityPubAdapterError, FollowIntent, ResolvedRemoteActor } from "../types";

const LOCAL_ACTOR = "https://fyd.example/ap/actors/nolan";
const REMOTE: ResolvedRemoteActor = {
  acct: "crepels@activitypub.academy",
  actorUri: "https://activitypub.academy/users/crepels",
  inboxUri: "https://activitypub.academy/users/crepels/inbox",
};

const FIXED_CLOCK = () => new Date("2026-09-21T12:00:00.000Z");
const FIXED_IDS = (actor: string, hint: "follow" | "undo") => `${actor}#${hint}-test-1`;

function followIntent(over: Partial<FollowIntent> = {}): FollowIntent {
  return {
    kind: "follow",
    target: { kind: "identity", identityId: "id:crepels" },
    ...over,
  };
}

describe("buildFollowActivity", () => {
  test("maps a follow intent to a Follow activity", () => {
    const activity = buildFollowActivity({
      intent: followIntent(),
      localActorUri: LOCAL_ACTOR,
      remote: REMOTE,
      newActivityId: FIXED_IDS,
      clock: FIXED_CLOCK,
    });
    expect(activity).toEqual({
      "@context": "https://www.w3.org/ns/activitystreams",
      id: `${LOCAL_ACTOR}#follow-test-1`,
      type: "Follow",
      actor: LOCAL_ACTOR,
      object: REMOTE.actorUri,
      published: "2026-09-21T12:00:00.000Z",
    });
  });

  test("maps an unfollow intent to an Undo wrapping the Follow", () => {
    const activity = buildFollowActivity({
      intent: followIntent({ kind: "unfollow" }),
      localActorUri: LOCAL_ACTOR,
      remote: REMOTE,
      newActivityId: FIXED_IDS,
      clock: FIXED_CLOCK,
    });
    expect(activity.type).toBe("Undo");
    expect(activity.id).toBe(`${LOCAL_ACTOR}#undo-test-1`);
    expect(activity.actor).toBe(LOCAL_ACTOR);
    const inner = activity.object;
    expect(typeof inner).toBe("object");
    if (typeof inner === "object") {
      expect(inner.type).toBe("Follow");
      expect(inner.id).toBe(`${LOCAL_ACTOR}#follow-test-1`);
      expect(inner.actor).toBe(LOCAL_ACTOR);
      expect(inner.object).toBe(REMOTE.actorUri);
    }
  });

  test("rejects follow of a content object target", () => {
    const act = () =>
      buildFollowActivity({
        intent: followIntent({
          target: { kind: "object", objectId: "obj:post-1", schema: "ping.social.post@1" },
        }),
        localActorUri: LOCAL_ACTOR,
        remote: REMOTE,
        newActivityId: FIXED_IDS,
        clock: FIXED_CLOCK,
      });
    expect(act).toThrow(ActivityPubAdapterError);
    try {
      act();
    } catch (error) {
      expect((error as ActivityPubAdapterError).kind).toBe("invalid_intent");
    }
  });

  test("rejects a null target", () => {
    expect(() =>
      buildFollowActivity({
        intent: followIntent({ target: null }),
        localActorUri: LOCAL_ACTOR,
        remote: REMOTE,
      }),
    ).toThrow(expect.objectContaining({ kind: "invalid_intent" }));
  });

  test("rejects a non-follow kind", () => {
    expect(() =>
      buildFollowActivity({
        intent: followIntent({ kind: "like" }),
        localActorUri: LOCAL_ACTOR,
        remote: REMOTE,
      }),
    ).toThrow(expect.objectContaining({ kind: "invalid_intent" }));
  });

  test("refuses to follow self", () => {
    const self: ResolvedRemoteActor = {
      acct: "nolan@fyd.example",
      actorUri: LOCAL_ACTOR,
      inboxUri: `${LOCAL_ACTOR}/inbox`,
    };
    expect(() =>
      buildFollowActivity({
        intent: followIntent(),
        localActorUri: LOCAL_ACTOR,
        remote: self,
      }),
    ).toThrow(expect.objectContaining({ kind: "self_follow" }));
  });

  test("is deterministic: same inputs, same document", () => {
    const options = {
      intent: followIntent(),
      localActorUri: LOCAL_ACTOR,
      remote: REMOTE,
      newActivityId: FIXED_IDS,
      clock: FIXED_CLOCK,
    };
    expect(buildFollowActivity(options)).toEqual(buildFollowActivity(options));
  });

  test("default id factory mints unique ids under the local actor", () => {
    const a = buildFollowActivity({ intent: followIntent(), localActorUri: LOCAL_ACTOR, remote: REMOTE });
    const b = buildFollowActivity({ intent: followIntent(), localActorUri: LOCAL_ACTOR, remote: REMOTE });
    expect(a.id.startsWith(`${LOCAL_ACTOR}#follow-`)).toBe(true);
    expect(a.id).not.toBe(b.id);
  });

  test("default clock stamps the current time", () => {
    const before = new Date();
    const activity = buildFollowActivity({
      intent: followIntent(),
      localActorUri: LOCAL_ACTOR,
      remote: REMOTE,
      newActivityId: FIXED_IDS,
    });
    const after = new Date();
    const published = new Date(activity.published ?? 0).getTime();
    expect(published).toBeGreaterThanOrEqual(before.getTime());
    expect(published).toBeLessThanOrEqual(after.getTime());
  });
});
