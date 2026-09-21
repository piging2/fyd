/**
 * Deterministic discovery-feed ranking (Lane A). PURE: given the same items
 * and the same "now", the order is identical. No randomness, no hidden
 * state, no infinite-scroll clone: callers page with a numeric offset.
 *
 * Score model (documented, boring on purpose):
 *   score = kindWeight + recencyScore + actorProximity
 * - kindWeight: object_activity 30, new_public_object 25,
 *   relationship_change 20, website_content 10.
 * - recencyScore: 40 at event time, decaying 1 point per 6 hours of age,
 *   floored at 0. Deterministic given nowIso.
 * - actorProximity: 0..10 supplied by the caller (10 = the viewer,
 *   7 = directly followed identity, 3 = second hop, 0 = unknown/public).
 *
 * Order: score desc, eventTime desc, id asc. The id tiebreak keeps the
 * order total even when two items share a score and timestamp.
 */

import type { DiscoveryKind } from "./types";

export interface RankableItem {
  id: string;
  kind: DiscoveryKind;
  eventTime: string;
  /** 0..10, see above. */
  actorProximity: number;
}

const KIND_WEIGHTS: Record<DiscoveryKind, number> = {
  object_activity: 30,
  new_public_object: 25,
  relationship_change: 20,
  website_content: 10,
};

export function kindWeight(kind: DiscoveryKind): number {
  return KIND_WEIGHTS[kind] ?? 0;
}

/** 40 at event time, minus 1 per 6h of age, floored at 0. */
export function recencyScore(eventTime: string, nowIso: string): number {
  const then = Date.parse(eventTime);
  const now = Date.parse(nowIso);
  if (Number.isNaN(then) || Number.isNaN(now)) return 0;
  const ageHours = Math.max(0, (now - then) / 3_600_000);
  return Math.max(0, 40 - Math.floor(ageHours / 6));
}

export function rankScore(item: RankableItem, nowIso: string): number {
  const proximity = Math.min(10, Math.max(0, item.actorProximity));
  return kindWeight(item.kind) + recencyScore(item.eventTime, nowIso) + proximity;
}

/**
 * Rank items deterministically. `nowIso` is a parameter (not Date.now())
 * so tests and replays pin the order exactly.
 */
/**
 * Order pre-scored items: score desc, eventTime desc, id asc.
 * Use when the caller already computed scores (e.g. with per-item proximity).
 */
export function compareRanked(
  a: { score: number; eventTime: string; id: string },
  b: { score: number; eventTime: string; id: string },
): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.eventTime !== b.eventTime) return a.eventTime < b.eventTime ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function rankDiscoveryItems<T extends RankableItem>(items: T[], nowIso: string): T[] {
  const scored = items.map((item) => ({ item, score: rankScore(item, nowIso) }));
  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.item.eventTime !== b.item.eventTime) return a.item.eventTime < b.item.eventTime ? 1 : -1;
    return a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0;
  });
  return scored.map((s) => s.item);
}
