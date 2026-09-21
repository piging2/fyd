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
