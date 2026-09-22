/**
 * PingObjectReader: the server-side BFF adapter between the PING website
 * and the PING gateway (Lane D).
 *
 * SERVER ONLY. Never import from a client component.
 *
 * Contract:
 * - All PING data flows through PING_GATEWAY_BASE_URL (env). No Oracle
 *   hostname, IP, or tunnel assumption is hardcoded anywhere.
 * - Reads use the existing gateway event query route as a temporary source.
 *   The UI never sees raw journal shapes; this adapter selects and
 *   sanitizes public Circle fields only.
 * - Writes submit signed canonical envelopes to the gateway ingest path.
 *   Dev signing happens server-side via dev-signer; private keys never
 *   reach the browser.
 * - When the gateway is not configured, unreachable, or has not yet
 *   exposed the needed path (Lane A dependency), every method throws a
 *   typed error with a machine-readable code. Nothing is faked.
 *
 * Event vocabulary used (registered gateway types):
 *   OBJECT_CREATED, OBJECT_UPDATED, RELATIONSHIP_CREATED
 * Profile schema:  ping.social.profile@1
 * Post schema:     ping.social.post@1
 * Relationship predicates (canonical): follows, likes.
 * Revocation is status: "inactive" on the same predicate. Follower and
 * like counts stay projections computed from events, never canonical truth.
 */

import type {
  CreateIdentityInput,
  PingIdentitySummary,
  PingPost,
  PublicCircleProjection,
} from "./types";
import type {
  AskAnswer,
  AskProposal,
  CapabilityPlan,
  DiscoveryFeedItem,
  IntelligentCircleData,
  NodePayload,
  PingObject,
  PingRelationship,
} from "./types";
import { planActions as planActionsPure } from "./action-planner";
import { grantsForViewer, isSiteCapableSchema } from "./grants";
import { buildAskContext, composeAnswer, verifyProposalDigest } from "./ask-composer";
import { compareRanked, rankScore } from "./feed-rank";
import { getWebsiteObjects, getWebsiteRelationships } from "./website-objects";
import {
  DevKeyDirNotConfiguredError,
  DevKeyNotFoundError,
  canonicalizeJson,
  generateDevKeypair,
  signAsIdentity,
  storeDevKeypair,
} from "./dev-signer";

// ---------------------------------------------------------------------------
// Typed errors: every failure mode the UI must render as an ERROR state.
// ---------------------------------------------------------------------------

export class PingReaderError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = "PingReaderError";
    this.code = code;
    this.status = status;
  }
}

export class GatewayNotConfiguredError extends PingReaderError {
  constructor() {
    super(
      "GATEWAY_NOT_CONFIGURED",
      "PING_GATEWAY_BASE_URL is not set. Set it to the gateway base URL " +
        "(for local dev, the SSH-forwarded local port) and retry.",
      503,
    );
  }
}

export class GatewayUnreachableError extends PingReaderError {
  constructor(detail: string) {
    super("GATEWAY_UNREACHABLE", `PING gateway unreachable: ${detail}`, 502);
  }
}

export class GatewayNotReadyError extends PingReaderError {
  constructor(detail: string) {
    super(
      "GATEWAY_NOT_READY",
      `Gateway path not ready: ${detail}. The runtime read/write path has not landed yet.`,
      502,
    );
  }
}

export class IdentityNotFoundError extends PingReaderError {
  constructor(identityId: string) {
    super("IDENTITY_NOT_FOUND", `No PING identity found for "${identityId}".`, 404);
  }
}

export class ObjectNotFoundError extends PingReaderError {
  constructor(objectId: string) {
    super("OBJECT_NOT_FOUND", `No PING object found for "${objectId}".`, 404);
  }
}

export class BadRequestError extends PingReaderError {
  constructor(message: string) {
    super("BAD_REQUEST", message, 400);
  }
}

export class SigningNotAvailableError extends PingReaderError {
  constructor(detail: string) {
    super("SIGNING_NOT_AVAILABLE", `Cannot sign practice action: ${detail}`, 500);
  }
}

// ---------------------------------------------------------------------------
// Adapter interface: the contract the practice UI is built against.
// ---------------------------------------------------------------------------

export interface PingObjectReader {
  listIdentities(viewerId?: string | null): Promise<PingIdentitySummary[]>;
  getProfile(identityId: string, viewerId?: string | null): Promise<PublicCircleProjection>;
  getFeed(identityId: string, viewerId?: string | null): Promise<PingPost[]>;
  createIdentity(input: CreateIdentityInput): Promise<PingIdentitySummary>;
  follow(subjectId: string, targetId: string): Promise<{ relationshipId: string }>;
  unfollow(subjectId: string, targetId: string): Promise<void>;
  like(subjectId: string, objectId: string): Promise<void>;
  unlike(subjectId: string, objectId: string): Promise<void>;
  updateBio(identityId: string, bio: string): Promise<void>;

  // -- Lane A: object substrate reads (same BFF authority) -----------------
  getObject(objectId: string, viewerId?: string | null): Promise<PingObject>;
  listObjects(viewerId?: string | null, opts?: { schema?: string; limit?: number }): Promise<PingObject[]>;
  getRelationships(filter?: { subject?: string; predicate?: string; object?: string }): Promise<PingRelationship[]>;
  getCircleCard(identityId: string, viewerId?: string | null): Promise<IntelligentCircleData>;
  getDiscoveryFeed(
    viewerId?: string | null,
    limit?: number,
  ): Promise<{ items: DiscoveryFeedItem[]; gatewayAvailable: boolean }>;
  planActions(viewerId: string | null, objectId: string): Promise<CapabilityPlan>;
  getNode(objectId: string, viewerId?: string | null): Promise<NodePayload>;
  ask(question: string, viewerId: string | null, targetObjectId?: string | null): Promise<AskAnswer>;
  submitProposal(viewerId: string, proposal: AskProposal): Promise<{ eventId: string }>;
}

// ---------------------------------------------------------------------------
// Gateway-backed implementation.
// ---------------------------------------------------------------------------

const PROFILE_SCHEMA = "ping.social.profile@1";
const POST_SCHEMA = "ping.social.post@1";

type JsonRecord = Record<string, unknown>;

function asRecord(v: unknown): JsonRecord | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as JsonRecord) : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function eventPayload(ev: JsonRecord): JsonRecord {
  return asRecord(ev.payload) ?? asRecord(ev.data) ?? asRecord(ev.body) ?? {};
}

function eventId(ev: JsonRecord): string {
  return str(ev.id) || str(ev.eventId) || str(ev.event_id);
}

function eventTime(ev: JsonRecord): string {
  const t = str(ev.createdAt) || str(ev.created_at) || str(ev.acceptedAt) || str(ev.timestamp) || str(ev.producedAt);
  return t || new Date(0).toISOString();
}

function isFacebookLinkedClaim(p: JsonRecord): boolean {
  const claims = p.claims;
  if (!Array.isArray(claims)) return false;
  return claims.some((c) => {
    const r = asRecord(c);
    return (
      !!r &&
      str(r.provider).toLowerCase() === "facebook" &&
      (str(r.claimType) === "account_link" || str(r.claim_type) === "account_link") &&
      (str(r.status) === "connected" || r.verified === true)
    );
  });
}

interface FollowEdge {
  subject: string;
  target: string;
}

interface LikeEdge {
  subject: string;
  object: string;
}

class GatewayPingObjectReader implements PingObjectReader {
  private base(): string {
    const raw = process.env.PING_GATEWAY_BASE_URL;
    if (!raw || !raw.trim()) throw new GatewayNotConfiguredError();
    return raw.trim().replace(/\/+$/, "");
  }

  private async gw(path: string, init?: RequestInit): Promise<Response> {
    const base = this.base();
    try {
      return await fetch(`${base}${path}`, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      throw new GatewayUnreachableError(err instanceof Error ? err.message : String(err));
    }
  }

  /** Temporary read source: the existing gateway event query route. */
  private async queryEvents(type: string): Promise<JsonRecord[]> {
    const res = await this.gw(`/events/${encodeURIComponent(type)}`);
    if (res.status === 404) {
      throw new GatewayNotReadyError(`event query route /events/${type} is not exposed`);
    }
    if (!res.ok) {
      throw new GatewayUnreachableError(`event query returned HTTP ${res.status}`);
    }
    const data: unknown = await res.json().catch(() => null);
    const rec = asRecord(data);
    const list = Array.isArray(data) ? data : rec?.events ?? rec?.items ?? rec?.data;
    if (!Array.isArray(list)) {
      throw new GatewayNotReadyError(`unexpected shape from /events/${type}`);
    }
    return list.map(asRecord).filter((r): r is JsonRecord => r !== null);
  }

  /**
   * Submit a signed canonical envelope to the gateway ingest path.
   * The gateway governs, validates, and persists; the website never writes
   * to the journal directly.
   */
  private async submitSignedEvent(
    identityId: string,
    type: "OBJECT_CREATED" | "OBJECT_UPDATED" | "RELATIONSHIP_CREATED",
    payload: JsonRecord,
  ): Promise<string> {
    const metadata: JsonRecord = {
      patch: "7B",
      source: "ping-website-practice",
      producedAt: new Date().toISOString(),
    };
    const canonicalBytes = canonicalizeJson({ type, payload, metadata });
    let proof: JsonRecord;
    try {
      const sig = signAsIdentity(identityId, canonicalBytes);
      proof = {
        algorithm: "ed25519",
        publicKey: sig.publicPem,
        keyFingerprint: sig.fingerprint,
        signature: sig.signature,
        signedBytes: "canonical-json(type,payload,metadata)",
      };
    } catch (err) {
      if (err instanceof DevKeyDirNotConfiguredError || err instanceof DevKeyNotFoundError) {
        throw new SigningNotAvailableError(err.message);
      }
      throw err;
    }
    const res = await this.gw("/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, payload, proof, metadata }),
    });
    if (res.status === 404 || res.status === 405) {
      throw new GatewayNotReadyError("canonical event ingest (POST /events) is not exposed");
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new PingReaderError(
        "GATEWAY_REJECTED_WRITE",
        `Gateway rejected the signed event (HTTP ${res.status}): ${text.slice(0, 300)}`,
        502,
      );
    }
    const data: unknown = await res.json().catch(() => null);
    const rec = asRecord(data);
    return str(rec?.id) || str(rec?.eventId) || "";
  }

  // -- relationship projections (computed from events on every read) --------

  private async followEdges(): Promise<FollowEdge[]> {
    const events = await this.queryEvents("RELATIONSHIP_CREATED");
    const edges: FollowEdge[] = [];
    for (const ev of events) {
      const p = eventPayload(ev);
      if (str(p.predicate) !== "follows") continue;
      const subject = str(p.subject) || str(p.subjectId);
      const target = str(p.object) || str(p.target) || str(p.targetId);
      // Canonical revocation: status "inactive" on the same predicate.
      const revoked = str(p.status) === "inactive";
      if (subject && target) edges.push({ subject, target: revoked ? `!${target}` : target });
    }
    return edges;
  }

  private netFollows(edges: FollowEdge[]): Map<string, Set<string>> {
    // subject -> set of currently followed targets (inactive status revokes)
    const net = new Map<string, Set<string>>();
    for (const e of edges) {
      let set = net.get(e.subject);
      if (!set) {
        set = new Set();
        net.set(e.subject, set);
      }
      if (e.target.startsWith("!")) set.delete(e.target.slice(1));
      else set.add(e.target);
    }
    return net;
  }

  private async likeEdges(): Promise<LikeEdge[]> {
    const events = await this.queryEvents("RELATIONSHIP_CREATED");
    const edges: LikeEdge[] = [];
    for (const ev of events) {
      const p = eventPayload(ev);
      if (str(p.predicate) !== "likes") continue;
      const subject = str(p.subject) || str(p.subjectId);
      const object = str(p.object) || str(p.objectId) || str(p.target);
      // Canonical revocation: status "inactive" on the same predicate.
      const revoked = str(p.status) === "inactive";
      if (subject && object) edges.push({ subject, object: revoked ? `!${object}` : object });
    }
    return edges;
  }

  private netLikes(edges: LikeEdge[]): Map<string, Set<string>> {
    const net = new Map<string, Set<string>>();
    for (const e of edges) {
      let set = net.get(e.subject);
      if (!set) {
        set = new Set();
        net.set(e.subject, set);
      }
      if (e.object.startsWith("!")) set.delete(e.object.slice(1));
      else set.add(e.object);
    }
    return net;
  }

  private async profileEvents(): Promise<JsonRecord[]> {
    const events = await this.queryEvents("OBJECT_CREATED");
    return events.filter((ev) => {
      const p = eventPayload(ev);
      return p.schema === PROFILE_SCHEMA && (p.visibility === undefined || p.visibility === "public");
    });
  }

  private profileUpdates(): Promise<JsonRecord[]> {
    return this.queryEvents("OBJECT_UPDATED").catch(() => []);
  }

  private toSummary(ev: JsonRecord, follows: Map<string, Set<string>>, viewerId?: string | null): PingIdentitySummary | null {
    const p = eventPayload(ev);
    const identityId = str(p.identityId) || str(p.controller);
    const displayName = str(p.displayName) || str(p.name);
    const handle = str(p.handle);
    if (!identityId || !displayName || !handle) return null;
    let followerCount = 0;
    for (const [, targets] of follows) if (targets.has(identityId)) followerCount += 1;
    const followingCount = follows.get(identityId)?.size ?? 0;
    return {
      id: identityId,
      displayName,
      handle,
      verified: p.verified === true,
      facebookConnected: isFacebookLinkedClaim(p),
      followerCount,
      followingCount,
      followedByViewer: viewerId ? (follows.get(viewerId)?.has(identityId) ?? false) : undefined,
    };
  }

  async listIdentities(viewerId?: string | null): Promise<PingIdentitySummary[]> {
    const [profiles, follows] = await Promise.all([this.profileEvents(), this.followEdges().then((e) => this.netFollows(e))]);
    // Latest profile event per identity wins.
    const latest = new Map<string, JsonRecord>();
    for (const ev of profiles) {
      const id = str(eventPayload(ev).identityId) || str(eventPayload(ev).controller);
      if (!id) continue;
      const prev = latest.get(id);
      if (!prev || eventTime(ev) >= eventTime(prev)) latest.set(id, ev);
    }
    const out: PingIdentitySummary[] = [];
    for (const ev of latest.values()) {
      const s = this.toSummary(ev, follows, viewerId);
      if (s) out.push(s);
    }
    out.sort((a, b) => a.displayName.localeCompare(b.displayName));
    return out;
  }

  async getProfile(identityId: string, viewerId?: string | null): Promise<PublicCircleProjection> {
    const [profiles, updates, follows] = await Promise.all([
      this.profileEvents(),
      this.profileUpdates(),
      this.followEdges().then((e) => this.netFollows(e)),
    ]);
    const mine = profiles.filter((ev) => {
      const p = eventPayload(ev);
      return str(p.identityId) === identityId || str(p.controller) === identityId;
    });
    if (mine.length === 0) throw new IdentityNotFoundError(identityId);
    mine.sort((a, b) => (eventTime(a) < eventTime(b) ? 1 : -1));
    const latest = mine[0];
    const p = eventPayload(latest);
    // Apply OBJECT_UPDATED bio changes on top of the created profile.
    let bio = str(p.bio);
    let updatedAt = eventTime(latest);
    for (const u of updates) {
      const up = eventPayload(u);
      if (str(up.objectId) === eventId(latest) || str(up.object_id) === eventId(latest)) {
        const changes = asRecord(up.changes) ?? asRecord(up.patch) ?? {};
        if (typeof changes.bio === "string") bio = changes.bio;
        if (eventTime(u) > updatedAt) updatedAt = eventTime(u);
      }
    }
    const summary = this.toSummary(latest, follows, viewerId);
    if (!summary) throw new IdentityNotFoundError(identityId);
    return {
      identity: summary,
      bio,
      objectId: eventId(latest),
      updatedAt,
      viewerFollowing: viewerId ? (follows.get(viewerId)?.has(identityId) ?? false) : false,
    };
  }

  async getFeed(identityId: string, viewerId?: string | null): Promise<PingPost[]> {
    const [events, follows, likes] = await Promise.all([
      this.queryEvents("OBJECT_CREATED"),
      this.followEdges().then((e) => this.netFollows(e)),
      this.likeEdges().then((e) => this.netLikes(e)),
    ]);
    const visible = new Set<string>([identityId, ...(follows.get(identityId) ?? [])]);
    const likeCounts = new Map<string, number>();
    const likedByViewer = new Set<string>();
    const likeNet = likes;
    for (const [subject, objects] of likeNet) {
      for (const o of objects) {
        likeCounts.set(o, (likeCounts.get(o) ?? 0) + 1);
        if (subject === viewerId) likedByViewer.add(o);
      }
    }
    const posts: PingPost[] = [];
    for (const ev of events) {
      const p = eventPayload(ev);
      if (p.schema !== POST_SCHEMA) continue;
      if (p.visibility !== undefined && p.visibility !== "public") continue;
      const authorId = str(p.authorId) || str(p.identityId) || str(p.controller);
      if (!authorId || !visible.has(authorId)) continue;
      const id = eventId(ev) || str(p.objectId);
      if (!id) continue;
      posts.push({
        id,
        authorId,
        authorDisplayName: str(p.authorDisplayName) || str(p.displayName),
        authorHandle: str(p.authorHandle) || str(p.handle),
        text: str(p.text) || str(p.body),
        createdAt: eventTime(ev),
        likeCount: likeCounts.get(id) ?? 0,
        likedByViewer: likedByViewer.has(id),
        replyTo: str(p.replyTo) || str(p.reply_to) || null,
      });
    }
    // Deterministic order: newest first, object id breaks ties.
    posts.sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? 1 : -1) : a.createdAt < b.createdAt ? 1 : -1));
    return posts;
  }

  async createIdentity(input: CreateIdentityInput): Promise<PingIdentitySummary> {
    const displayName = input.displayName.trim();
    const handle = input.handle.trim().toLowerCase();
    const bio = input.bio.trim();
    if (!displayName) throw new BadRequestError("Display name is required.");
    if (!/^[a-z0-9_]{2,24}$/.test(handle)) {
      throw new BadRequestError("Handle must be 2-24 chars: lowercase letters, digits, underscore.");
    }
    if (bio.length > 280) throw new BadRequestError("Bio must be 280 characters or fewer.");
    // The canonical identity id is minted by the PING runtime (IdentityAuthority
    // owns identity). The website generates the dev keypair and submits the
    // public key; the gateway returns the canonical identity id.
    let keypair;
    try {
      keypair = generateDevKeypair();
    } catch {
      throw new SigningNotAvailableError("could not generate an Ed25519 keypair");
    }
    const res = await this.gw("/identities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, handle, bio, publicKey: keypair.publicPem, algorithm: "ed25519" }),
    });
    if (res.status === 404 || res.status === 405) {
      throw new GatewayNotReadyError("canonical identity creation (POST /identities) is not exposed");
    }
    if (!res.ok) {
      throw new PingReaderError("GATEWAY_REJECTED_WRITE", `Gateway rejected identity creation (HTTP ${res.status}).`, 502);
    }
    const data: unknown = await res.json().catch(() => null);
    const rec = asRecord(data);
    const identityId = str(rec?.identityId) || str(rec?.id);
    if (!identityId) throw new GatewayNotReadyError("identity creation returned no canonical identity id");
    try {
      storeDevKeypair(identityId, keypair);
    } catch (err) {
      if (err instanceof DevKeyDirNotConfiguredError) {
        throw new SigningNotAvailableError(err.message);
      }
      throw err;
    }
    // Register the public profile through the governed canonical event path.
    await this.submitSignedEvent(identityId, "OBJECT_CREATED", {
      schema: PROFILE_SCHEMA,
      identityId,
      displayName,
      handle,
      bio,
      visibility: "public",
      verified: false,
    });
    return {
      id: identityId,
      displayName,
      handle,
      verified: false,
      facebookConnected: false,
      followerCount: 0,
      followingCount: 0,
      followedByViewer: false,
    };
  }

  async follow(subjectId: string, targetId: string): Promise<{ relationshipId: string }> {
    if (!subjectId) throw new BadRequestError("No active practice identity. Select an identity first.");
    if (subjectId === targetId) throw new BadRequestError("An identity cannot follow itself.");
    const relationshipId = await this.submitSignedEvent(subjectId, "RELATIONSHIP_CREATED", {
      subject: subjectId,
      predicate: "follows",
      object: targetId,
    });
    return { relationshipId };
  }

  async unfollow(subjectId: string, targetId: string): Promise<void> {
    if (!subjectId) throw new BadRequestError("No active practice identity. Select an identity first.");
    await this.submitSignedEvent(subjectId, "RELATIONSHIP_CREATED", {
      subject: subjectId,
      predicate: "follows",
      object: targetId,
      status: "inactive",
    });
  }

  async like(subjectId: string, objectId: string): Promise<void> {
    if (!subjectId) throw new BadRequestError("No active practice identity. Select an identity first.");
    if (!objectId) throw new BadRequestError("No object to like.");
    await this.submitSignedEvent(subjectId, "RELATIONSHIP_CREATED", {
      subject: subjectId,
      predicate: "likes",
      object: objectId,
    });
  }

  async unlike(subjectId: string, objectId: string): Promise<void> {
    if (!subjectId) throw new BadRequestError("No active practice identity. Select an identity first.");
    await this.submitSignedEvent(subjectId, "RELATIONSHIP_CREATED", {
      subject: subjectId,
      predicate: "likes",
      object: objectId,
      status: "inactive",
    });
  }

  async updateBio(identityId: string, bio: string): Promise<void> {
    if (!identityId) throw new BadRequestError("No active practice identity. Select an identity first.");
    const clean = bio.trim();
    if (clean.length > 280) throw new BadRequestError("Bio must be 280 characters or fewer.");
    const profile = await this.getProfile(identityId);
    await this.submitSignedEvent(identityId, "OBJECT_UPDATED", {
      objectId: profile.objectId,
      schema: PROFILE_SCHEMA,
      changes: { bio: clean },
    });
  }
  // -----------------------------------------------------------------------
  // Lane A: object substrate. Projections over the same canonical events;
  // no new authorities. Website-derived objects merge at read time only.
  // -----------------------------------------------------------------------

  private sanitizeFields(payload: JsonRecord): Record<string, string | string[]> {
    const DENY = new Set([
      "schema", "identityId", "controller", "authorId", "ownerId", "visibility",
      "verified", "handle", "displayName", "name", "title", "bio", "text", "body",
      "subject", "object", "target", "predicate", "status", "objectId", "object_id",
      "changes", "patch", "proof", "metadata", "signature", "publicKey", "privateKey",
      "token", "secret", "password", "claims", "keyFingerprint", "replyTo", "reply_to",
    ]);
    const out: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (DENY.has(k)) continue;
      if (typeof v === "string") {
        if (v.trim() !== "") out[k] = v.slice(0, 500);
      } else if (Array.isArray(v) && v.length > 0 && v.every((e) => typeof e === "string")) {
        out[k] = (v as string[]).slice(0, 20).map((s) => s.slice(0, 200));
      }
    }
    return out;
  }

  private objectTitle(schema: string, p: JsonRecord): string {
    const pick = (...keys: string[]): string => {
      for (const k of keys) {
        const v = str(p[k]);
        if (v) return v;
      }
      return "";
    };
    if (schema === "ping.social.post@1") {
      const t = pick("text", "body");
      return t.length > 80 ? `${t.slice(0, 77)}...` : t;
    }
    return pick("displayName", "name", "title");
  }

  private toPingObject(
    id: string,
    payload: JsonRecord,
    createdAt: string,
    updatedAt: string,
  ): PingObject | null {
    const schema = str(payload.schema);
    if (!schema) return null;
    const controllerId =
      str(payload.identityId) || str(payload.controller) || str(payload.authorId) || str(payload.ownerId);
    const visibility = str(payload.visibility) === "private" ? "private" : "public";
    let description = "";
    for (const k of ["bio", "description", "summary", "excerpt", "tagline"]) {
      const v = str(payload[k]);
      if (v) {
        description = v;
        break;
      }
    }
    if (schema === "ping.social.post@1") description = str(payload.text) || str(payload.body);
    return {
      id,
      schema,
      controllerId,
      visibility,
      title: this.objectTitle(schema, payload) || id.slice(0, 12),
      description,
      fields: this.sanitizeFields(payload),
      createdAt,
      updatedAt,
      provenance: { kind: "canonical-journal", ref: id, derivedAt: new Date().toISOString() },
    };
  }

  /** Latest OBJECT_CREATED per object id, with OBJECT_UPDATED overlays. */
  private async canonicalObjects(): Promise<PingObject[]> {
    const [created, updated] = await Promise.all([
      this.queryEvents("OBJECT_CREATED"),
      this.queryEvents("OBJECT_UPDATED").catch(() => [] as JsonRecord[]),
    ]);
    const byId = new Map<string, { payload: JsonRecord; createdAt: string; updatedAt: string; updatedRefs: string[] }>();
    for (const ev of created) {
      const p = eventPayload(ev);
      const id = eventId(ev) || str(p.objectId);
      if (!id || !str(p.schema)) continue;
      const t = eventTime(ev);
      const prev = byId.get(id);
      if (!prev || t >= prev.createdAt) {
        byId.set(id, { payload: { ...p }, createdAt: t, updatedAt: t, updatedRefs: [] });
      }
    }
    for (const u of updated) {
      const up = eventPayload(u);
      const id = str(up.objectId) || str(up.object_id);
      const entry = byId.get(id);
      if (!entry) continue;
      const changes = asRecord(up.changes) ?? asRecord(up.patch) ?? {};
      for (const [k, v] of Object.entries(changes)) {
        if (typeof v === "string" || (Array.isArray(v) && v.every((e) => typeof e === "string"))) {
          entry.payload[k] = v;
        }
      }
      const t = eventTime(u);
      if (t > entry.updatedAt) entry.updatedAt = t;
      const uid = eventId(u);
      if (uid) entry.updatedRefs.push(uid);
    }
    const out: PingObject[] = [];
    for (const [id, e] of byId) {
      const obj = this.toPingObject(id, e.payload, e.createdAt, e.updatedAt);
      if (obj) {
        if (e.updatedRefs.length > 0) obj.provenance.updatedRefs = e.updatedRefs;
        out.push(obj);
      }
    }
    out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return out;
  }

  private visibleTo(obj: PingObject, viewerId?: string | null): boolean {
    if (obj.visibility === "public") return true;
    return !!viewerId && viewerId === obj.controllerId;
  }

  private isGatewayError(err: unknown): boolean {
    return (
      err instanceof GatewayNotConfiguredError ||
      err instanceof GatewayUnreachableError ||
      err instanceof GatewayNotReadyError
    );
  }

  /** Canonical objects, falling back to website-derived only when the gateway path is down. */
  private async allObjects(viewerId?: string | null): Promise<{ objects: PingObject[]; gatewayAvailable: boolean }> {
    const web = getWebsiteObjects().filter((o) => this.visibleTo(o, viewerId));
    try {
      const canonical = (await this.canonicalObjects()).filter((o) => this.visibleTo(o, viewerId));
      const seen = new Set(canonical.map((o) => o.id));
      return { objects: [...canonical, ...web.filter((o) => !seen.has(o.id))], gatewayAvailable: true };
    } catch (err) {
      if (this.isGatewayError(err)) return { objects: web, gatewayAvailable: false };
      throw err;
    }
  }

  async getObject(objectId: string, viewerId?: string | null): Promise<PingObject> {
    const web = getWebsiteObjects().find((o) => o.id === objectId);
    if (web && this.visibleTo(web, viewerId)) return web;
    const { objects } = await this.allObjects(viewerId);
    const obj = objects.find((o) => o.id === objectId);
    if (!obj) throw new ObjectNotFoundError(objectId);
    return obj;
  }

  async listObjects(
    viewerId?: string | null,
    opts?: { schema?: string; limit?: number },
  ): Promise<PingObject[]> {
    const { objects } = await this.allObjects(viewerId);
    let out = opts?.schema ? objects.filter((o) => o.schema === opts.schema) : objects;
    out = [...out].sort((a, b) => (a.updatedAt === b.updatedAt ? (a.id < b.id ? -1 : 1) : a.updatedAt < b.updatedAt ? 1 : -1));
    if (opts?.limit !== undefined) out = out.slice(0, Math.max(0, opts.limit));
    return out;
  }

  async getRelationships(filter?: {
    subject?: string;
    predicate?: string;
    object?: string;
  }): Promise<PingRelationship[]> {
    const out: PingRelationship[] = [];
    try {
      const events = await this.queryEvents("RELATIONSHIP_CREATED");
      for (const ev of events) {
        const p = eventPayload(ev);
        const predicate = str(p.predicate);
        if (!predicate) continue;
        out.push({
          id: eventId(ev) || `rel:${predicate}:${str(p.subject)}:${str(p.object)}`,
          subject: str(p.subject) || str(p.subjectId),
          predicate,
          object: str(p.object) || str(p.target) || str(p.targetId) || str(p.objectId),
          status: str(p.status) === "inactive" ? "inactive" : "active",
          createdAt: eventTime(ev),
          evidenceRef: eventId(ev),
        });
      }
    } catch (err) {
      if (!this.isGatewayError(err)) throw err;
    }
    try {
      // Derived reply edges: a post with replyTo references its parent.
      const created = await this.queryEvents("OBJECT_CREATED");
      for (const ev of created) {
        const p = eventPayload(ev);
        if (p.schema !== POST_SCHEMA) continue;
        const replyTo = str(p.replyTo) || str(p.reply_to);
        const id = eventId(ev) || str(p.objectId);
        if (replyTo && id) {
          out.push({
            id: `reply:${id}`,
            subject: id,
            predicate: "replies",
            object: replyTo,
            status: "active",
            createdAt: eventTime(ev),
            evidenceRef: id,
          });
        }
      }
    } catch (err) {
      if (!this.isGatewayError(err)) throw err;
    }
    const all = [...getWebsiteRelationships(), ...out];
    const f = filter ?? {};
    const filtered = all.filter(
      (r) =>
        (!f.subject || r.subject === f.subject) &&
        (!f.predicate || r.predicate === f.predicate) &&
        (!f.object || r.object === f.object),
    );
    filtered.sort((a, b) =>
      a.createdAt === b.createdAt ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.createdAt < b.createdAt ? 1 : -1,
    );
    return filtered;
  }

  async getCircleCard(identityId: string, viewerId?: string | null): Promise<IntelligentCircleData> {
    const [profile, follows, objects] = await Promise.all([
      this.getProfile(identityId, viewerId),
      this.followEdges().then((e) => this.netFollows(e)),
      this.allObjects(viewerId).then((r) => r.objects).catch(() => [] as PingObject[]),
    ]);
    // Raw profile payload for the extended card fields.
    const profiles = await this.profileEvents();
    const mine = profiles.filter((ev) => {
      const p = eventPayload(ev);
      return str(p.identityId) === identityId || str(p.controller) === identityId;
    });
    mine.sort((a, b) => (eventTime(a) < eventTime(b) ? 1 : -1));
    const p = mine.length > 0 ? eventPayload(mine[0]) : {};

    const rawKind = str(p.type) || str(p.kind) || str(p.circleKind);
    const kind =
      rawKind === "person" || rawKind === "business" || rawKind === "organization" || rawKind === "agent"
        ? rawKind
        : null;
    const website = str(p.website) || str(p.url) || null;
    let domain: string | null = null;
    if (website) {
      try {
        domain = new URL(website.startsWith("http") ? website : `https://${website}`).hostname.replace(/^www\./, "");
      } catch {
        domain = null;
      }
    }
    const networks: { network: string; url?: string; label?: string }[] = [];
    const claims = p.claims;
    if (Array.isArray(claims)) {
      for (const c of claims) {
        const r = asRecord(c);
        if (!r) continue;
        const provider = str(r.provider);
        const linked = str(r.status) === "connected" || r.verified === true;
        if (provider && linked) {
          networks.push({
            network: provider.charAt(0).toUpperCase() + provider.slice(1),
            url: str(r.url) || str(r.profileUrl) || undefined,
            label: "Connected account",
          });
        }
      }
    }
    if (website && !networks.some((n) => n.url === website)) {
      networks.push({ network: "Website", url: website });
    }

    const topObjects = objects
      .filter((o) => o.controllerId === identityId && o.visibility === "public")
      .sort((a, b) => (a.updatedAt === b.updatedAt ? (a.id < b.id ? -1 : 1) : a.updatedAt < b.updatedAt ? 1 : -1))
      .slice(0, 3)
      .map((o) => ({ id: o.id, schema: o.schema, title: o.title }));

    const viewerFollows = viewerId ? follows.get(viewerId) ?? new Set<string>() : new Set<string>();
    const targetFollows = follows.get(identityId) ?? new Set<string>();
    let mutualCount = 0;
    for (const t of viewerFollows) if (targetFollows.has(t)) mutualCount += 1;

    return {
      identity: profile.identity,
      objectId: profile.objectId,
      kind,
      description: profile.bio,
      website,
      domain,
      location: str(p.location) || str(p.city) || null,
      category: str(p.category) || str(p.businessCategory) || null,
      avatarUrl: str(p.avatarUrl) || str(p.avatar) || null,
      networks,
      topObjects,
      relationshipContext: {
        followedByViewer: profile.viewerFollowing,
        followsViewer: viewerId ? (follows.get(identityId)?.has(viewerId) ?? false) : false,
        mutualCount,
      },
      provenanceLabel: "PING canonical profile",
      updatedAt: profile.updatedAt,
    };
  }

  async getDiscoveryFeed(
    viewerId?: string | null,
    limit = 30,
  ): Promise<{ items: DiscoveryFeedItem[]; gatewayAvailable: boolean }> {
    const nowIso = new Date().toISOString();
    const items: DiscoveryFeedItem[] = [];
    let gatewayAvailable = true;

    try {
      const [relEvents, follows, identities] = await Promise.all([
        this.queryEvents("RELATIONSHIP_CREATED"),
        this.followEdges().then((e) => this.netFollows(e)),
        this.listIdentities(viewerId).catch(() => [] as import("./types").PingIdentitySummary[]),
      ]);
      const nameOf = new Map(identities.map((i) => [i.id, i.displayName]));
      const shortName = (id: string) => nameOf.get(id) ?? `${id.slice(0, 12)}`;

      // 1. Object activity: posts in the viewer feed.
      if (viewerId) {
        const feed = await this.getFeed(viewerId, viewerId).catch(() => [] as import("./types").PingPost[]);
        for (const post of feed.slice(0, 20)) {
          const obj = await this.getObject(post.id, viewerId).catch(() => null);
          if (!obj) continue;
          const mine = post.authorId === viewerId;
          items.push({
            kind: "object_activity",
            object: obj,
            actorId: post.authorId,
            actorDisplayName: post.authorDisplayName || null,
            eventTime: post.createdAt,
            reason: mine ? "Your post." : `New post by ${post.authorDisplayName || shortName(post.authorId)}.`,
            score: 0,
            evidenceRef: post.id,
          });
          const last = items[items.length - 1];
          last.score = rankScore({ id: last.object.id, kind: last.kind, eventTime: last.eventTime, actorProximity: mine ? 10 : 7 }, nowIso);
        }
      }

      // 2. Relationship changes involving the viewer (latest 15).
      const rels = relEvents
        .map((ev) => ({ ev, p: eventPayload(ev) }))
        .filter(({ p }) => {
          const s = str(p.subject) || str(p.subjectId);
          const o = str(p.object) || str(p.target) || str(p.targetId);
          return !!viewerId && (s === viewerId || o === viewerId);
        })
        .sort((a, b) => (eventTime(a.ev) < eventTime(b.ev) ? 1 : -1))
        .slice(0, 15);
      for (const { ev, p } of rels) {
        const s = str(p.subject) || str(p.subjectId);
        const o = str(p.object) || str(p.target) || str(p.targetId);
        const predicate = str(p.predicate);
        const inactive = str(p.status) === "inactive";
        const other = s === viewerId ? o : s;
        const anchor = await this.getObject(other, viewerId).catch(() => null);
        if (!anchor) continue;
        const verb =
          predicate === "follows"
            ? inactive
              ? "unfollowed"
              : "followed"
            : predicate === "likes"
              ? inactive
                ? "unliked"
                : "liked"
              : `${predicate}${inactive ? " (revoked)" : ""}`;
        items.push({
          kind: "relationship_change",
          object: anchor,
          actorId: s === viewerId ? viewerId : s,
          actorDisplayName: s === viewerId ? nameOf.get(viewerId) ?? null : shortName(s),
          eventTime: eventTime(ev),
          reason:
            s === viewerId
              ? `You ${verb} ${shortName(o)}.`
              : `${shortName(s)} ${verb} ${o === viewerId ? "you" : shortName(o)}.`,
          score: 0,
          evidenceRef: eventId(ev),
        });
        const last = items[items.length - 1];
        last.score = rankScore({ id: last.object.id, kind: last.kind, eventTime: last.eventTime, actorProximity: 10 }, nowIso);
      }

      // 3. Newly discovered public objects (latest 10 by creation).
      const { objects } = await this.allObjects(viewerId);
      const fresh = [...objects]
        .sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? 1 : -1))
        .slice(0, 10);
      const seenIds = new Set(items.map((i) => i.object.id));
      const followedSet = viewerId ? follows.get(viewerId) ?? new Set<string>() : new Set<string>();
      for (const o of fresh) {
        if (seenIds.has(o.id)) continue;
        const prox = o.controllerId === viewerId ? 10 : followedSet.has(o.controllerId) ? 7 : 0;
        items.push({
          kind: "new_public_object",
          object: o,
          actorId: null,
          actorDisplayName: null,
          eventTime: o.createdAt,
          reason: `New public object: ${o.title}.`,
          score: 0,
          evidenceRef: o.provenance.ref,
        });
        const last = items[items.length - 1];
        last.score = rankScore({ id: last.object.id, kind: last.kind, eventTime: last.eventTime, actorProximity: prox }, nowIso);
      }
    } catch (err) {
      if (this.isGatewayError(err)) {
        gatewayAvailable = false;
      } else {
        throw err;
      }
    }

    // 4. Website content: always available, clearly labeled.
    for (const o of getWebsiteObjects()) {
      if (o.schema !== "ping.social.article@1" && o.schema !== "ping.social.product@1") continue;
      if (items.some((i) => i.object.id === o.id)) continue;
      items.push({
        kind: "website_content",
        object: o,
        actorId: null,
        actorDisplayName: "PING Social",
        eventTime: o.createdAt,
        reason: `From the PING Social website: ${o.title}.`,
        score: 0,
        evidenceRef: o.provenance.ref,
      });
      const last = items[items.length - 1];
      last.score = rankScore({ id: last.object.id, kind: last.kind, eventTime: last.eventTime, actorProximity: 0 }, nowIso);
    }

    const ranked = [...items]
      .sort((a, b) =>
        compareRanked(
          { score: a.score, eventTime: a.eventTime, id: a.object.id },
          { score: b.score, eventTime: b.eventTime, id: b.object.id },
        ),
      )
      .slice(0, Math.max(1, limit));
    return { items: ranked, gatewayAvailable };
  }

  async planActions(viewerId: string | null, objectId: string): Promise<CapabilityPlan> {
    const object = await this.getObject(objectId, viewerId);
    const identitySchemas = new Set(["ping.social.profile@1", "ping.social.person@1", "ping.social.business@1"]);
    const targetIdentityId =
      object.controllerId &&
      !object.controllerId.startsWith("web:") &&
      identitySchemas.has(object.schema)
        ? object.controllerId
        : null;
    let followedByViewer = false;
    let likedByViewer = false;
    try {
      const [follows, likes] = await Promise.all([
        this.followEdges().then((e) => this.netFollows(e)),
        this.likeEdges().then((e) => this.netLikes(e)),
      ]);
      if (viewerId) {
        if (targetIdentityId) followedByViewer = follows.get(viewerId)?.has(targetIdentityId) ?? false;
        likedByViewer = likes.get(viewerId)?.has(objectId) ?? false;
      }
    } catch (err) {
      if (!this.isGatewayError(err)) throw err;
    }
    const website =
      (typeof object.fields.website === "string" && object.fields.website) ||
      (typeof object.fields.url === "string" && object.fields.url.startsWith("http") ? object.fields.url : null) ||
      null;
    // Explicit grants from the user-facing grant authority. The planner is
    // still the capability authority; these grants only open the FYD site
    // actions for site-capable objects the viewer controls.
    const grants = grantsForViewer({
      viewerId,
      controllerId: object.controllerId,
      isSite: isSiteCapableSchema(object.schema),
    });
    return planActionsPure({
      viewerId,
      target: object,
      targetIdentityId,
      followedByViewer,
      likedByViewer,
      website,
      grants,
    });
  }

  async getNode(objectId: string, viewerId?: string | null): Promise<NodePayload> {
    const [object, relationships, plan] = await Promise.all([
      this.getObject(objectId, viewerId),
      this.getRelationships().catch(() => [] as PingRelationship[]),
      this.planActions(viewerId ?? null, objectId),
    ]);
    const rel = relationships
      .filter(
        (r) =>
          r.subject === objectId ||
          r.object === objectId ||
          r.subject === object.controllerId ||
          r.object === object.controllerId,
      )
      .slice(0, 40);
    const { objects } = await this.allObjects(viewerId).catch(() => ({
      objects: [] as PingObject[],
      gatewayAvailable: false,
    }));
    const byId = new Map(objects.map((o) => [o.id, o]));
    const relatedIds: string[] = [];
    for (const r of rel) {
      for (const id of [r.subject, r.object]) {
        if (id !== objectId && id !== object.controllerId && !relatedIds.includes(id)) relatedIds.push(id);
      }
      if (relatedIds.length >= 12) break;
    }
    const related = relatedIds
      .map((id) => byId.get(id))
      .filter((o): o is PingObject => !!o)
      .slice(0, 12);
    let controller: import("./types").PingIdentitySummary | null = null;
    if (object.controllerId && !object.controllerId.startsWith("web:")) {
      try {
        controller = (await this.getProfile(object.controllerId, viewerId)).identity;
      } catch {
        controller = null;
      }
    }
    return { object, relationships: rel, related, controller, plan };
  }

  async ask(
    question: string,
    viewerId: string | null,
    targetObjectId?: string | null,
  ): Promise<AskAnswer> {
    const target = targetObjectId ? await this.getObject(targetObjectId, viewerId) : null;
    const [relationships, plan, identities] = await Promise.all([
      this.getRelationships().catch(() => [] as PingRelationship[]),
      targetObjectId ? this.planActions(viewerId, targetObjectId) : Promise.resolve(null),
      this.listIdentities(viewerId).catch(() => [] as import("./types").PingIdentitySummary[]),
    ]);
    const rel = target
      ? relationships
          .filter(
            (r) =>
              r.subject === target.id || r.object === target.id || r.subject === target.controllerId || r.object === target.controllerId,
          )
          .slice(0, 20)
      : [];
    const { objects } = await this.allObjects(viewerId).catch(() => ({
      objects: [] as PingObject[],
      gatewayAvailable: false,
    }));
    const byId = new Map(objects.map((o) => [o.id, o]));
    const relatedIds: string[] = [];
    for (const r of rel) {
      for (const id of [r.subject, r.object]) {
        if (target && id !== target.id && id !== target.controllerId && !relatedIds.includes(id)) {
          relatedIds.push(id);
        }
      }
      if (relatedIds.length >= 8) break;
    }
    let related = relatedIds.map((id) => byId.get(id)).filter((o): o is PingObject => !!o);
    if (target && related.length === 0) {
      // Fallback: recent objects from the same controller.
      related = objects
        .filter((o) => o.controllerId === target.controllerId && o.id !== target.id && o.visibility === "public")
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
        .slice(0, 8);
    }
    const viewer = identities.find((i) => i.id === viewerId) ?? null;
    const ctx = buildAskContext({
      viewer: { id: viewerId, displayName: viewer?.displayName ?? null },
      target,
      relatedObjects: related,
      relationships: rel,
      plan,
    });
    return composeAnswer(ctx, question);
  }

  /**
   * Human approval endpoint for Ask PING proposals. Re-verifies the exact
   * digest, enforces owner-only updates, then submits through the governed
   * signed envelope path as the viewer identity. Agents cannot call this
   * with a forged digest: any modification fails verification.
   */
  async submitProposal(viewerId: string, proposal: AskProposal): Promise<{ eventId: string }> {
    if (!viewerId) throw new BadRequestError("No active identity. Select an identity first.");
    if (!verifyProposalDigest(proposal)) {
      throw new BadRequestError("Proposal digest mismatch. The proposal changed after drafting; draft it again.");
    }
    if (proposal.kind === "object_update") {
      if (!proposal.targetObjectId) throw new BadRequestError("Update proposal needs a target object.");
      const obj = await this.getObject(proposal.targetObjectId, viewerId);
      if (obj.controllerId !== viewerId) {
        throw new BadRequestError("Only the controlling identity can update this object.");
      }
      if (obj.provenance.kind !== "canonical-journal") {
        throw new BadRequestError("Only canonical-journal objects can be updated here.");
      }
      const eventId = await this.submitSignedEvent(viewerId, "OBJECT_UPDATED", {
        objectId: obj.id,
        schema: proposal.schema,
        changes: proposal.changes,
      });
      return { eventId };
    }
    if (proposal.kind === "site_patch") {
      // Agent-drafted SiteSpec transition. The digest was re-verified above;
      // the envelope binding is checked at the API boundary (the FYD lane
      // owns the signing key material). Approval is a human act: the owner
      // approves the exact digest, and the approved patch is recorded as one
      // governed OBJECT_UPDATED. The agent never applies it directly and
      // nothing is published by this path.
      const obj = await this.getObject(proposal.targetObjectId, viewerId);
      if (obj.controllerId !== viewerId) {
        throw new BadRequestError("Only the controlling identity can approve a site change.");
      }
      const siteGrants = grantsForViewer({
        viewerId,
        controllerId: obj.controllerId,
        isSite: isSiteCapableSchema(obj.schema),
      });
      if (!siteGrants.includes("site.propose")) {
        throw new BadRequestError("This identity cannot propose site changes for this site.");
      }
      if (proposal.envelope && proposal.envelope.payload_hash !== proposal.digest) {
        throw new BadRequestError("Site-patch envelope does not bind this proposal digest.");
      }
      const eventId = await this.submitSignedEvent(viewerId, "OBJECT_UPDATED", {
        objectId: obj.id,
        schema: proposal.schema,
        changes: {
          ...proposal.changes,
          site_patch: JSON.stringify(proposal.sitePatch),
          proposal_digest: proposal.digest,
          site_spec_digest: proposal.sitePatch.siteSpecDigest,
        },
      });
      return { eventId };
    }
    const eventId = await this.submitSignedEvent(viewerId, "OBJECT_CREATED", {
      schema: proposal.schema,
      ...proposal.changes,
      visibility: "public",
    });
    return { eventId };
  }
}


// ---------------------------------------------------------------------------
// Factory: one reader for the BFF. Swap the implementation here when the
// runtime exposes a dedicated read API; the UI does not change.
// ---------------------------------------------------------------------------

let reader: PingObjectReader | null = null;

export function getPingObjectReader(): PingObjectReader {
  if (!reader) reader = new GatewayPingObjectReader();
  return reader;
}
