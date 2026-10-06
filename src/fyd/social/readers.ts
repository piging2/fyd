/**
 * Journal-first social readers. SERVER ONLY.
 *
 * Every read below is computed live from the PING journal
 * (GET /events/<TYPE> on the repo-booted gateway). Canonical truth is
 * ping_events; these readers derive net relationship state with the same
 * last-wins ordering the projector uses: (sequence DESC, created_at DESC,
 * event_id DESC) per (subject, predicate, object).
 *
 * No fake counts, no hardcoded follow state. A count is a projection over
 * journaled events; an absent relationship reads as absent, never as zero
 * masquerading as knowledge.
 */

import { fydGatewayBaseUrl } from "./config";

export interface JournalEvent {
  event_id: string;
  event_type: string;
  source: string;
  timestamp: string;
  created_at: string;
  sequence: number | null;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

/** node-postgres returns BIGINT as a string; normalize to number|null. */
export function asSequence(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = parseInt(value, 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export async function readJournalEvents(
  eventType: string,
  limit = 1000,
): Promise<JournalEvent[]> {
  const res = await fetch(
    `${fydGatewayBaseUrl()}/events/${eventType}?limit=${limit}`,
    { cache: "no-store" },
  );
  if (!res.ok) {
    throw new Error(`journal read ${eventType} failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { events?: unknown[] };
  const events = Array.isArray(body.events) ? body.events : [];
  return events.map((e) => {
    const ev = e as Record<string, unknown>;
    return {
      event_id: String(ev.event_id || ""),
      event_type: String(ev.event_type || eventType),
      source: String(ev.source || ""),
      timestamp: String(ev.timestamp || ""),
      created_at: String(ev.created_at || ev.timestamp || ""),
      sequence: asSequence(ev.sequence),
      payload: (ev.payload || {}) as Record<string, unknown>,
      metadata: (ev.metadata || {}) as Record<string, unknown>,
    };
  });
}

export interface NetRelationship {
  relationship_id: string;
  subject: string;
  predicate: string;
  object: string;
  status: "active" | "inactive";
  sequence: number | null;
  event_id: string;
}

/**
 * Net relationship state: last-wins per (subject, predicate, object).
 * This is a read-time projection over the journal, not canonical state.
 */
export async function readNetRelationships(filter?: {
  subject?: string;
  predicate?: string;
  object?: string;
  status?: "active" | "inactive";
}): Promise<NetRelationship[]> {
  const events = await readJournalEvents("RELATIONSHIP_CREATED");
  const net = new Map<string, NetRelationship>();
  for (const e of events) {
    const p = e.payload;
    if (
      typeof p.subject !== "string" ||
      typeof p.predicate !== "string" ||
      typeof p.object !== "string"
    ) {
      continue;
    }
    const key = `${p.subject}|${p.predicate}|${p.object}`;
    const row: NetRelationship = {
      relationship_id: String(p.relationship_id || ""),
      subject: p.subject,
      predicate: p.predicate,
      object: p.object,
      status: p.status === "inactive" ? "inactive" : "active",
      sequence: e.sequence,
      event_id: e.event_id,
    };
    const cur = net.get(key);
    if (!cur || winsOver(row, cur)) net.set(key, row);
  }
  return [...net.values()].filter(
    (r) =>
      (!filter?.subject || r.subject === filter.subject) &&
      (!filter?.predicate || r.predicate === filter.predicate) &&
      (!filter?.object || r.object === filter.object) &&
      (!filter?.status || r.status === filter.status),
  );
}

function winsOver(a: NetRelationship, b: NetRelationship): boolean {
  const sa = a.sequence ?? -1;
  const sb = b.sequence ?? -1;
  if (sa !== sb) return sa > sb;
  if (a.event_id !== b.event_id) return a.event_id > b.event_id;
  return false;
}

export interface FydIdentityView {
  identityId: string;
  displayName: string;
  handle: string;
  bio: string;
  found: boolean;
}

export interface FydProfileView {
  displayName: string;
  handle: string;
  bio: string;
  objectId: string;
  found: boolean;
}

async function readIdentityList(): Promise<
  Array<Record<string, unknown>>
> {
  const res = await fetch(`${fydGatewayBaseUrl()}/identities`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`identity list failed: HTTP ${res.status}`);
  const body = (await res.json()) as { identities?: unknown[] };
  return Array.isArray(body.identities)
    ? (body.identities as Array<Record<string, unknown>>)
    : [];
}

/** Identity + profile views for one identity id, both journal-derived. */
export async function readIdentityView(identityId: string): Promise<{
  identity: FydIdentityView;
  profile: FydProfileView;
}> {
  const list = await readIdentityList();
  const hit = list.find(
    (i) =>
      i.identityId === identityId ||
      i.identity_id === identityId ||
      (i.payload as Record<string, unknown> | undefined)?.object_id === identityId,
  );

  const objectEvents = await readJournalEvents("OBJECT_CREATED");
  const profilePayload = objectEvents
    .map((e) => e.payload)
    .find(
      (p) =>
        p.schema === "ping.social.profile@1" &&
        (p.controller === identityId || p.identityId === identityId),
    );
  const content = (profilePayload?.content || {}) as Record<string, unknown>;
  const profile: FydProfileView = {
    displayName: String(content.display_name ?? profilePayload?.displayName ?? ""),
    handle: String(content.handle ?? profilePayload?.handle ?? ""),
    bio: String(content.bio ?? profilePayload?.bio ?? ""),
    objectId: String(profilePayload?.object_id ?? ""),
    found: Boolean(profilePayload),
  };
  // The identity list endpoint only carries display_name; fall back to the
  // journaled profile for empty fields. Both are journal-derived truth.
  const nonEmpty = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : "");
  const identity: FydIdentityView = {
    identityId,
    displayName:
      nonEmpty(hit?.displayName) || nonEmpty(hit?.display_name) || profile.displayName,
    handle: nonEmpty(hit?.handle) || profile.handle,
    bio: nonEmpty(hit?.bio) || profile.bio,
    found: Boolean(hit),
  };
  return { identity, profile };
}

export interface FydSocialState {
  identityId: string;
  identity: FydIdentityView;
  profile: FydProfileView;
  following: string[];
  followers: string[];
  followingCount: number;
  followerCount: number;
  /** Provenance marker: every count above is projected from this source. */
  source: "ping_events";
}

/**
 * Full social state for a node identity, read live from the PING journal.
 * Counts are projections; absence is absence.
 */
export async function readSocialState(identityId: string): Promise<FydSocialState> {
  const [{ identity, profile }, rels] = await Promise.all([
    readIdentityView(identityId),
    readNetRelationships({ predicate: "follows" }),
  ]);
  const following = rels
    .filter((r) => r.subject === identityId && r.status === "active")
    .map((r) => r.object);
  const followers = rels
    .filter((r) => r.object === identityId && r.status === "active")
    .map((r) => r.subject);
  return {
    identityId,
    identity,
    profile,
    following,
    followers,
    followingCount: following.length,
    followerCount: followers.length,
    source: "ping_events",
  };
}

export interface FydFeedPost {
  objectId: string;
  authorId: string;
  text: string;
  createdAt: string;
  likeCount: number;
  source: "ping_events";
}

/**
 * Visibility-aware feed: own public posts + public posts by actively
 * followed identities, newest-first with object-id tiebreak. Like counts
 * are projections from net like edges.
 */
export async function readFeed(
  identityId: string,
  limit = 50,
): Promise<FydFeedPost[]> {
  const [follows, objectEvents, likes] = await Promise.all([
    readNetRelationships({ subject: identityId, predicate: "follows", status: "active" }),
    readJournalEvents("OBJECT_CREATED"),
    readNetRelationships({ predicate: "likes", status: "active" }),
  ]);
  const visibleAuthors = new Set<string>([
    identityId,
    ...follows.map((r) => r.object),
  ]);
  const likeCount = new Map<string, number>();
  for (const l of likes) {
    likeCount.set(l.object, (likeCount.get(l.object) || 0) + 1);
  }
  return objectEvents
    .map((e) => e.payload)
    .filter(
      (p) =>
        p.schema === "ping.social.post@1" &&
        typeof p.controller === "string" &&
        visibleAuthors.has(p.controller) &&
        // Fail-closed visibility: a post whose visibility is missing or
        // anything other than "public" is never served publicly. (Was a
        // fail-open `|| "public"` default: a malformed journal event
        // would have published itself.)
        p.visibility === "public" &&
        p.status !== "tombstoned",
    )
    .map((p) => {
      const content = (p.content || {}) as Record<string, unknown>;
      const objectId = String(p.object_id || "");
      return {
        objectId,
        authorId: String(p.controller || ""),
        text: String(content.text ?? p.text ?? ""),
        createdAt: String(p.created_at || ""),
        likeCount: likeCount.get(objectId) || 0,
        source: "ping_events" as const,
      };
    })
    .sort((a, b) =>
      a.createdAt !== b.createdAt
        ? a.createdAt < b.createdAt
          ? 1
          : -1
        : a.objectId < b.objectId
          ? 1
          : -1,
    )
    .slice(0, limit);
}
