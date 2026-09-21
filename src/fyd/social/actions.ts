/**
 * FYD social actions: follow / unfollow (and dev identity minting).
 * SERVER ONLY. Every write goes through PING's canonical capability path:
 * a signed bff-envelope@1 RELATIONSHIP_CREATED submitted to the repo-booted
 * gateway, journaled in ping_events. FYD owns no social runtime.
 *
 * Safety properties (absorbed C1 + C4):
 * - C1: every action carries a deterministic content-hash action ID
 *   (fydActionId). If the journal already shows the desired net state, the
 *   action is reported deduped and nothing is re-emitted.
 * - C4: after submitting, the attestation gate re-reads the journal and
 *   checks the named preconditions (row exists, latest status is the wanted
 *   status, latest event is the submitted one). A failed follow can never
 *   report success: attestation failure returns ok:false with the missing
 *   evidence named.
 *
 * Revocation uses the canonical pattern: status 'inactive' on the same
 * 'follows' predicate. There is no 'unfollows' predicate; it is forbidden
 * by the vocabulary and rejected by the gateway.
 */

import { fydGatewayBaseUrl } from "./config";
import { generateDevKeypair, storeFydKeypair } from "./key-custody";
import { buildSignedEnvelope, submitEnvelope, EnvelopeRejectedError } from "./envelope";
import { fydActionId, relateActionMaterial } from "./transition-id";
import { attestRelationshipState, attestObjectCreated } from "./attestation-gate";
import { readNetRelationships } from "./readers";

export { EnvelopeRejectedError };

const IDENTITY_RE = /^identity_[0-9a-f]{16}$/;

function assertIdentityId(value: string, name: string): void {
  if (!IDENTITY_RE.test(value)) {
    throw new Error(`invalid ${name}: expected identity_<16hex>, got "${value}"`);
  }
}

export interface FydIdentityResult {
  identityId: string;
  displayName: string;
  handle: string;
  eventId: string;
  profileEventId: string;
}

/**
 * Mint a fresh DEV identity through the PING gateway (POST /identities),
 * escrow its dev keypair server-side, and publish its profile as a signed
 * ping.social.profile@1 OBJECT_CREATED envelope. Dev identities only.
 */
export async function createFydIdentity(input: {
  displayName: string;
  handle: string;
  bio?: string;
}): Promise<FydIdentityResult> {
  const displayName = input.displayName?.trim() || "";
  const handle = input.handle?.trim() || "";
  const bio = (input.bio || "").slice(0, 280);
  if (displayName.length < 1 || displayName.length > 80) {
    throw new Error("displayName must be 1-80 chars.");
  }
  if (!/^[a-z0-9_]{2,24}$/.test(handle)) {
    throw new Error("handle must match ^[a-z0-9_]{2,24}$.");
  }
  const kp = generateDevKeypair();
  const res = await fetch(`${fydGatewayBaseUrl()}/identities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      displayName,
      handle,
      bio,
      publicKey: kp.publicPem,
      algorithm: "ed25519",
    }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      `identity mint rejected: ${String(body.error || `HTTP_${res.status}`)} ${String(body.message || "")}`,
    );
  }
  const identityId = String(body.identityId || "");
  assertIdentityId(identityId, "minted identityId");
  storeFydKeypair(identityId, kp);

  const env = buildSignedEnvelope(identityId, "OBJECT_CREATED", {
    schema: "ping.social.profile@1",
    identityId,
    displayName,
    handle,
    bio,
    visibility: "public",
  });
  const submitted = await submitEnvelope(env);
  return {
    identityId,
    displayName,
    handle,
    eventId: String(body.eventId || ""),
    profileEventId: submitted.event_id,
  };
}

export type RelateResult =
  | {
      ok: true;
      deduped: boolean;
      actionId: string;
      relationshipId: string;
      status: "active" | "inactive";
      eventId: string;
      sequence: number | null;
    }
  | {
      ok: false;
      actionId: string;
      reason: "ATTESTATION_REJECTED";
      missing: string[];
      eventId: string;
    };

async function relate(
  actorId: string,
  targetId: string,
  status: "active" | "inactive",
): Promise<RelateResult> {
  assertIdentityId(actorId, "actorId");
  assertIdentityId(targetId, "targetId");
  if (actorId === targetId) throw new Error("an identity cannot follow itself.");

  const actionId = fydActionId(
    relateActionMaterial({ subject: actorId, predicate: "follows", object: targetId, status }),
  );

  // C1 idempotency: the journal's net state already equals the desired state.
  const existing = await readNetRelationships({
    subject: actorId,
    predicate: "follows",
    object: targetId,
  });
  const current = existing[0];
  if (current && current.status === status) {
    return {
      ok: true,
      deduped: true,
      actionId,
      relationshipId: current.relationship_id,
      status,
      eventId: current.event_id,
      sequence: current.sequence,
    };
  }

  const env = buildSignedEnvelope(actorId, "RELATIONSHIP_CREATED", {
    subject: actorId,
    predicate: "follows",
    object: targetId,
    status,
  });
  const submitted = await submitEnvelope(env);

  // C4 attestation gate: the journal must show the new state before success.
  const att = await attestRelationshipState({
    subject: actorId,
    predicate: "follows",
    object: targetId,
    wantStatus: status,
    expectEventId: submitted.event_id,
  });
  if (!att.attested) {
    return {
      ok: false,
      actionId,
      reason: att.reason,
      missing: att.missing,
      eventId: submitted.event_id,
    };
  }
  return {
    ok: true,
    deduped: false,
    actionId,
    relationshipId: att.relationshipId,
    status,
    eventId: att.eventId,
    sequence: att.sequence,
  };
}

/** Alice follows Bob: RELATIONSHIP_CREATED {subject, follows, object, active}. */
export function followIdentity(actorId: string, targetId: string): Promise<RelateResult> {
  return relate(actorId, targetId, "active");
}

/** Revocation: same predicate, status 'inactive'. No 'unfollows' exists. */
export function unfollowIdentity(actorId: string, targetId: string): Promise<RelateResult> {
  return relate(actorId, targetId, "inactive");
}

export interface FydPostResult {
  ok: true;
  actionId: string;
  objectId: string;
  eventId: string;
  sequence: number | null;
}

/**
 * Publish a post as a dev identity: signed OBJECT_CREATED with schema
 * ping.social.post@1. Same C1/C4 contract as relate: deterministic action
 * ID, and the journal is re-read before success is reported.
 */
export async function createFydPost(
  identityId: string,
  text: string,
  opts: { visibility?: "public" | "followers" | "private"; refs?: string[] } = {},
): Promise<FydPostResult> {
  assertIdentityId(identityId, "identityId");
  const clean = text.trim().slice(0, 2000);
  if (!clean) throw new Error("text must be non-empty.");
  const visibility = opts.visibility || "public";

  const actionId = fydActionId({
    kind: "social.post",
    controller: identityId,
    text: clean.slice(0, 80),
    visibility,
  });

  const env = buildSignedEnvelope(identityId, "OBJECT_CREATED", {
    schema: "ping.social.post@1",
    authorId: identityId,
    text: clean,
    refs: opts.refs || [],
    visibility,
  });
  const submitted = await submitEnvelope(env);

  const att = await attestObjectCreated({
    eventId: submitted.event_id,
    schema: "ping.social.post@1",
    controller: identityId,
  });
  if (!att.attested) {
    throw new Error(
      `ATTESTATION_REJECTED: post not journaled; missing: ${att.missing.join("; ")}`,
    );
  }
  return {
    ok: true,
    actionId,
    objectId: att.objectId,
    eventId: att.eventId,
    sequence: att.sequence,
  };
}
