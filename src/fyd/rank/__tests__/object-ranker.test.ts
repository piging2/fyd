import { rankCandidates, RANK_WEIGHTS } from "../object-ranker";
import type { RankCandidate } from "../object-ranker";

function cand(over: Partial<RankCandidate> & { objectId: string }): RankCandidate {
  return {
    semanticProximity: 0.5,
    followed: false,
    liked: false,
    capabilityCount: 4,
    recentInteractionAt: null,
    slotStability: 1,
    slotCollisionRisk: 0,
    ...over,
  };
}

describe("ContextObjectRanker", () => {
  test("deterministic: same input, same order", () => {
    const cs = [cand({ objectId: "b" }), cand({ objectId: "a", followed: true })];
    const r1 = rankCandidates(cs, 1000).map((c) => c.objectId);
    const r2 = rankCandidates(cs, 1000).map((c) => c.objectId);
    expect(r1).toEqual(r2);
    expect(r1[0]).toBe("a"); // followed outranks
  });

  test("tie-break is lexicographic objectId", () => {
    const cs = [cand({ objectId: "zzz" }), cand({ objectId: "aaa" })];
    const r = rankCandidates(cs, 1000).map((c) => c.objectId);
    expect(r).toEqual(["aaa", "zzz"]);
  });

  test("completed follow+like is demoted", () => {
    const done = cand({ objectId: "done", followed: true, liked: true });
    const fresh = cand({ objectId: "fresh", semanticProximity: 0.9 });
    const r = rankCandidates([done, fresh], 1000).map((c) => c.objectId);
    expect(r[0]).toBe("fresh");
  });

  test("collision risk penalizes", () => {
    const risky = cand({ objectId: "risky", slotCollisionRisk: 1 });
    const clean = cand({ objectId: "clean" });
    const r = rankCandidates([risky, clean], 1000).map((c) => c.objectId);
    expect(r[0]).toBe("clean");
  });

  test("weights are exported and sum sensibly", () => {
    expect(RANK_WEIGHTS.proximity).toBeGreaterThan(0);
    expect(RANK_WEIGHTS.followed).toBeGreaterThan(0);
  });
});
