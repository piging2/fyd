/**
 * ContextObjectRanker: answers WHAT deserves a slot, separately from layout.
 * Sponsorship is composed after this organic score, never added to it.
 */
export interface RankCandidate {
  objectId: string;
  /** 0..1 spatial/semantic proximity to the slot, not geographic distance. */
  semanticProximity: number;
  /** Required before proximity can produce a human semantic explanation. */
  semanticTargetPresent?: boolean;
  followed: boolean;
  liked: boolean;
  capabilityCount: number;
  recentInteractionAt: number | null;
  slotStability: number;
  slotCollisionRisk: number;
  /** Active viewer suppression supplied by the relationship boundary. */
  suppression?: "hidden" | "dismissed" | "not-interested";
}

export interface RankReason {
  code: "page-context" | "followed" | "available-actions" | "recent-interaction" | "relationship-saturation";
  text: string;
  source: "semanticTargetPresent" | "followed" | "capabilityCount" | "recentInteractionAt" | "followed+liked";
}

export interface RankBreakdown {
  baseRelevance: number;
  relationshipAdjustment: number;
  saturationAdjustment: number;
  recencyAdjustment: number;
  collisionAdjustment: number;
  /** Paid placement never changes organic scoring. */
  sponsorshipAdjustment: 0;
  finalScore: number;
}

export interface RankedCandidate extends RankCandidate {
  score: number;
  breakdown: RankBreakdown;
  reasons: RankReason[];
}

export const RANK_WEIGHTS = {
  proximity: 0.35,
  followed: 0.25,
  capability: 0.1,
  recency: 0.15,
  stability: 0.15,
  /** Existing policy: reduce repeat discovery after both positive actions. */
  completedPenalty: 0.3,
  collisionPenalty: 0.2,
} as const;

const RECENCY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;

function recencyScore(at: number | null, now: number): number {
  if (at === null) return 0;
  return Math.pow(0.5, Math.max(0, now - at) / RECENCY_HALF_LIFE_MS);
}

/**
 * This preserves the existing tested saturation policy, not a negative opinion
 * of the business. LIKE alone has no ranking effect; FOLLOW still adds 0.25.
 */
export function relationshipSaturationPenalty(candidate: Pick<RankCandidate, "followed" | "liked">): number {
  return candidate.followed && candidate.liked ? RANK_WEIGHTS.completedPenalty : 0;
}

export function explainCandidateRank(candidate: RankCandidate, now: number): RankedCandidate {
  const c = candidate;
  const w = RANK_WEIGHTS;
  const proximity = w.proximity * c.semanticProximity;
  const relationshipAdjustment = w.followed * (c.followed ? 1 : 0);
  const capability = w.capability * Math.min(1, c.capabilityCount / 6);
  const recencyAdjustment = w.recency * recencyScore(c.recentInteractionAt, now);
  const stability = w.stability * c.slotStability;
  const saturationAdjustment = -relationshipSaturationPenalty(c);
  const collisionAdjustment = -w.collisionPenalty * c.slotCollisionRisk;
  // Preserve the previous arithmetic order as well as its weights.
  const score = proximity + relationshipAdjustment + capability + recencyAdjustment + stability + saturationAdjustment + collisionAdjustment;
  const reasons: RankReason[] = [];
  if (c.semanticTargetPresent === true && proximity > 0) {
    reasons.push({ code: "page-context", text: "Related to this part of the page", source: "semanticTargetPresent" });
  }
  if (c.followed) reasons.push({ code: "followed", text: "You follow this business", source: "followed" });
  if (c.capabilityCount > 0) reasons.push({ code: "available-actions", text: "Offers actions you can take", source: "capabilityCount" });
  if (c.recentInteractionAt !== null && c.recentInteractionAt <= now && now - c.recentInteractionAt <= RECENCY_HALF_LIFE_MS) {
    reasons.push({ code: "recent-interaction", text: "You interacted with this object recently", source: "recentInteractionAt" });
  }
  if (saturationAdjustment < 0) {
    reasons.push({ code: "relationship-saturation", text: "Lower discovery priority after you follow and like", source: "followed+liked" });
  }
  return {
    ...c,
    score,
    reasons,
    breakdown: {
      baseRelevance: proximity + capability + stability,
      relationshipAdjustment,
      saturationAdjustment,
      recencyAdjustment,
      collisionAdjustment,
      sponsorshipAdjustment: 0,
      finalScore: score,
    },
  };
}

export function rankCandidates(candidates: RankCandidate[], now: number = Date.now()): RankedCandidate[] {
  return candidates
    .filter((candidate) => candidate.suppression === undefined)
    .map((candidate) => explainCandidateRank(candidate, now))
    .sort((a, b) => b.score - a.score || (a.objectId < b.objectId ? -1 : a.objectId > b.objectId ? 1 : 0));
}
