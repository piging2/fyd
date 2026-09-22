/**
 * Related-circle candidate selector (pure: no I/O, no network).
 *
 * selectRelatedCircles walks the tenant's first-class relationships in
 * BOTH directions from the owner object (breadth-first over active edges)
 * and returns one candidate per reachable object. Candidates are honest
 * graph facts, never fabricated or padded:
 * - inactive edges are skipped
 * - the owner itself is skipped (no self-circles)
 * - edges to unknown or non-public objects are skipped
 * - an unknown or non-public owner yields [] (not an error)
 *
 * Ranking is deterministic: predicate priority (located_at, provides,
 * works_for, links_to — in that order; unknown predicates after all known
 * ones), then object id lexicographic tiebreak. Output order never depends
 * on the relationship order in the dump. Optional limit truncates.
 *
 * direction is the edge's direction relative to the node the walk reached
 * it from: "out" when that node is the subject, "in" when it is the
 * object. For the common one-hop case that node is the owner, so
 * direction reads from the owner's perspective.
 */

import type { ObjectGraph } from "../sitespec/types";

export interface RelatedCircle {
  objectId: string;
  predicate: string;
  /** Edge direction relative to the node the walk reached this object from. */
  direction: "in" | "out";
}

export interface SelectRelatedCirclesOpts {
  /** Maximum candidates to return (after ranking). */
  limit?: number;
}

/** Predicate priority: lower wins. Unknown predicates sort after known ones. */
const PREDICATE_PRIORITY: Record<string, number> = {
  located_at: 0,
  provides: 1,
  works_for: 2,
  links_to: 3,
};
const UNKNOWN_PREDICATE_RANK = 99;

function predicateRank(predicate: string): number {
  return PREDICATE_PRIORITY[predicate] ?? UNKNOWN_PREDICATE_RANK;
}

/** Best-edge-wins comparison for dedup when one object is reachable twice. */
function compareCandidates(a: RelatedCircle, b: RelatedCircle): number {
  return (
    predicateRank(a.predicate) - predicateRank(b.predicate) ||
    (a.predicate < b.predicate ? -1 : a.predicate > b.predicate ? 1 : 0) ||
    (a.direction < b.direction ? -1 : a.direction > b.direction ? 1 : 0)
  );
}

export function selectRelatedCircles(
  graph: ObjectGraph,
  ownerObjectId: string,
  opts?: SelectRelatedCirclesOpts,
): RelatedCircle[] {
  const byId = new Map(graph.objects.map((o) => [o.id, o]));
  const owner = byId.get(ownerObjectId);
  if (!owner || owner.visibility !== "public") return [];

  // Canonical edge order so output never depends on dump order.
  const edges = graph.relationships
    .filter((r) => r.status === "active")
    .slice()
    .sort((a, b) =>
      a.subject < b.subject
        ? -1
        : a.subject > b.subject
          ? 1
          : a.predicate < b.predicate
            ? -1
            : a.predicate > b.predicate
              ? 1
              : a.object < b.object
                ? -1
                : a.object > b.object
                  ? 1
                  : 0,
    );

  const visited = new Set<string>([ownerObjectId]);
  const best = new Map<string, RelatedCircle>();
  const consider = (objectId: string, predicate: string, direction: "in" | "out") => {
    const candidate: RelatedCircle = { objectId, predicate, direction };
    const prev = best.get(objectId);
    if (!prev || compareCandidates(candidate, prev) < 0) {
      best.set(objectId, candidate);
    }
  };

  let frontier = [ownerObjectId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const node of frontier) {
      for (const e of edges) {
        let other: string | null = null;
        let direction: "in" | "out" = "out";
        if (e.subject === node && e.object !== node) {
          other = e.object;
          direction = "out";
        } else if (e.object === node && e.subject !== node) {
          other = e.subject;
          direction = "in";
        } else {
          continue;
        }
        if (other === ownerObjectId) continue; // never circle back to the owner
        const target = byId.get(other);
        if (!target || target.visibility !== "public") continue; // never surface unknown/private objects
        consider(other, e.predicate, direction);
        if (!visited.has(other)) {
          visited.add(other);
          next.push(other);
        }
      }
    }
    frontier = next;
  }

  const ranked = [...best.values()].sort(
    (a, b) =>
      predicateRank(a.predicate) - predicateRank(b.predicate) ||
      (a.objectId < b.objectId ? -1 : a.objectId > b.objectId ? 1 : 0),
  );
  if (typeof opts?.limit === "number") {
    return ranked.slice(0, Math.max(0, opts.limit));
  }
  return ranked;
}
