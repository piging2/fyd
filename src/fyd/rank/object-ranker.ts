/**
 * ContextObjectRanker: answers WHAT deserves a slot. Separate from layout.
 *
 * Geometry never decides relevance. This is a pure, deterministic function:
 * same candidates + slots + context -> same ranking. Tie-breaks fall back
 * to lexicographic objectId so output is total-order stable.
 */

export interface RankCandidate {
  objectId: string;
  /** 0..1 semantic proximity of the object to the slot. */
  semanticProximity: number;
  /** Viewer relationship: following the object boosts relevance. */
  followed: boolean;
  liked: boolean;
  /** 0..n capabilities available on the object. */
  capabilityCount: number;
  /** Epoch ms of last interaction, or null. */
  recentInteractionAt: number | null;
  /** Slot stability 0..1 from the slot manager. */
  slotStability: number;
  /** Slot collision risk 0..1 from the slot manager. */
  slotCollisionRisk: number;
}

export interface RankedCandidate extends RankCandidate {
  score: number;
}

export const RANK_WEIGHTS = {
  proximity: 0.35,
  followed: 0.25,
  capability: 0.1,
  recency: 0.15,
  stability: 0.15,
  completedPenalty: 0.3,
  collisionPenalty: 0.2,
} as const;

const RECENCY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;

function recencyScore(at: number | null, now: number): number {
  if (at === null) return 0;
  const age = Math.max(0, now - at);
  return Math.pow(0.5, age / RECENCY_HALF_LIFE_MS);
}

export function rankCandidates(
  candidates: RankCandidate[],
  now: number = Date.now(),
): RankedCandidate[] {
  const w = RANK_WEIGHTS;
  return candidates
    .map((c) => {
      const completed = c.followed && c.liked;
      const score =
        w.proximity * c.semanticProximity +
        w.followed * (c.followed ? 1 : 0) +
        w.capability * Math.min(1, c.capabilityCount / 6) +
        w.recency * recencyScore(c.recentInteractionAt, now) +
        w.stability * c.slotStability -
        w.completedPenalty * (completed ? 1 : 0) -
        w.collisionPenalty * c.slotCollisionRisk;
      return { ...c, score };
    })
    .sort((a, b) => b.score - a.score || (a.objectId < b.objectId ? -1 : 1));
}
