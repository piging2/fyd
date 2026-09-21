/**
 * Capability-aware action planner (Lane A). PURE and DETERMINISTIC: the same
 * function output drives the human UI action row and the agent context
 * builder, so humans and agents see the same available actions.
 *
 * Rules:
 * - open, ask, reference are always available for a known object.
 * - follow/unfollow apply to identity-backed objects only (profile, person,
 *   business, organization, agent schemas), never to content objects, and
 *   never to self.
 * - like/unlike apply to content objects only (post, article, project,
 *   product, service, location, offer, unknown). LIKE belongs on objects,
 *   not identities.
 * - reply is available on posts for a signed-in viewer.
 * - propose_update is available only when the viewer controls the object.
 * - open_website appears only when the object carries a public website/url.
 */

import type { CapabilityPlan, PingObject, PlannedAction } from "./types";

/** Schemas whose controller is an identity the viewer can follow. */
const IDENTITY_SCHEMAS = new Set([
  "ping.social.profile@1",
  "ping.social.person@1",
  "ping.social.business@1",
  "ping.social.organization@1",
  "ping.social.agent@1",
]);

export interface PlannerInput {
  viewerId: string | null;
  target: PingObject;
  /** Identity id behind the target when identity-backed, else null. */
  targetIdentityId: string | null;
  followedByViewer: boolean;
  likedByViewer: boolean;
  website: string | null;
}

function referenceAction(objectId: string): PlannedAction {
  return {
    kind: "reference",
    label: "Copy reference",
    target: { kind: "reference", referenceId: `ping:object:${objectId}` },
    reason: "Every object has a stable reference id you can cite.",
  };
}

export function planActions(input: PlannerInput): CapabilityPlan {
  const { viewerId, target, targetIdentityId, followedByViewer, likedByViewer, website } = input;
  const actions: PlannedAction[] = [];
  const isIdentityTarget = targetIdentityId !== null && IDENTITY_SCHEMAS.has(target.schema);
  const viewerIsOwner =
    viewerId !== null && target.controllerId !== "" && viewerId === target.controllerId;

  actions.push({
    kind: "open",
    label: "Open",
    target: { kind: "object", objectId: target.id, schema: target.schema },
    reason: "Open the full Node page for this object.",
  });
  actions.push({
    kind: "ask",
    label: "Ask PING",
    target: { kind: "ask", objectId: target.id, prefill: null },
    reason: "Ask a question with this object as evidence-backed context.",
  });

  if (isIdentityTarget && targetIdentityId) {
    if (viewerId && viewerId !== targetIdentityId) {
      actions.push(
        followedByViewer
          ? {
              kind: "unfollow",
              label: "Unfollow",
              target: { kind: "identity", identityId: targetIdentityId },
              reason:
                "You currently follow this identity. Unfollowing records follows with status inactive.",
            }
          : {
              kind: "follow",
              label: "Follow",
              target: { kind: "identity", identityId: targetIdentityId },
              reason: "Follow to see the public objects of this identity in your feed.",
            },
      );
    }
  } else if (viewerId) {
    // Content objects: LIKE belongs here, never on identities.
    actions.push(
      likedByViewer
        ? {
            kind: "unlike",
            label: "Unlike",
            target: { kind: "object", objectId: target.id, schema: target.schema },
            reason:
              "You currently like this object. Unliking records likes with status inactive.",
          }
        : {
            kind: "like",
            label: "Like",
            target: { kind: "object", objectId: target.id, schema: target.schema },
            reason: "Like this object. Likes are public relationship events.",
          },
    );
    if (target.schema === "ping.social.post@1") {
      actions.push({
        kind: "reply",
        label: "Reply",
        target: { kind: "ask", objectId: target.id, prefill: "Draft a reply to this post: " },
        reason:
          "Draft a reply as a proposal. You approve the exact text before anything is published.",
      });
    }
  }

  if (viewerIsOwner) {
    actions.push({
      kind: "propose_update",
      label: "Propose update",
      target: { kind: "ask", objectId: target.id, prefill: "Propose updating the description to: " },
      reason:
        "You control this object, so you can propose updates. Nothing changes until you approve the exact digest.",
    });
  }

  if (website) {
    actions.push({
      kind: "open_website",
      label: "Visit website",
      target: { kind: "url", url: website },
      reason: "The object lists a public website.",
    });
  }

  actions.push(referenceAction(target.id));

  return {
    viewerId,
    targetObjectId: target.id,
    targetSchema: target.schema,
    viewerIsOwner,
    actions,
    capabilities: actions.map((a) => a.kind),
  };
}

/** Compact capability line for the agent context builder. */
export function capabilitiesLine(plan: CapabilityPlan): string {
  return plan.capabilities.join(",");
}
