/**
 * Conflict detection: when two sources make claims about the same entity
 * and the same field but disagree on the value, FYD must KNOW the conflict,
 * not silently pick a winner. A conflict record keeps both claims with full
 * provenance, carries a human-readable surface text, and stays "open" until
 * a human resolves it. Resolution records the decision; it never deletes the
 * losing claim.
 */

import { createHash } from "node:crypto";
import { claimSlotKey } from "./types.ts";
import type { Claim, Conflict } from "./types.ts";

function conflictIdFor(a: Claim, b: Claim): string {
  const [first, second] = [a.claimId, b.claimId].sort();
  return "cf-" + createHash("sha256")
    .update(a.entityId + "|" + a.field + "|" + first + "|" + second)
    .digest("hex")
    .slice(0, 12);
}

function sourceLabel(c: Claim): string {
  if (c.grade === "synthetic_fixture") return "the synthetic Facebook fixture (labeled test data)";
  if (c.sourceKind === "website") return "your website";
  if (c.sourceKind === "facebook") return "your Facebook page";
  return c.sourceKind;
}

export function conflictSurfaceText(entityId: string, field: string, a: Claim, b: Claim): string {
  const fieldName = field.replace(/_/g, " ");
  return (
    "Conflict on " + entityId + " field '" + fieldName + "': " +
    sourceLabel(a) + " (observed " + a.observedAt.slice(0, 10) + ") says '" +
    a.value + "', while " + sourceLabel(b) + " (observed " +
    b.observedAt.slice(0, 10) + ") says '" + b.value + "'. " +
    "Both claims are kept with their provenance. Tell me which one is right, " +
    "and I will regenerate only the affected sections."
  );
}

/**
 * Detect conflicts across a set of claims. Rules:
 *  - same entityId and same field, but different normalized values,
 *  - from different source kinds (website vs facebook vs synthetic),
 *  - one Conflict per disagreeing pair, deduped by conflict id.
 * Identical values across sources produce no conflict. A single source
 * never conflicts with itself.
 */
export function detectConflicts(claims: Claim[], detectedAt: string): Conflict[] {
  const bySlot = new Map<string, Claim[]>();
  for (const c of claims) {
    const key = claimSlotKey(c.entityId, c.field);
    const arr = bySlot.get(key);
    if (arr) arr.push(c);
    else bySlot.set(key, [c]);
  }

  const conflicts: Conflict[] = [];
  const seen = new Set<string>();
  for (const [, slotClaims] of bySlot) {
    for (let i = 0; i < slotClaims.length; i++) {
      for (let j = i + 1; j < slotClaims.length; j++) {
        const a = slotClaims[i];
        const b = slotClaims[j];
        if (a.sourceKind === b.sourceKind) continue;
        if (a.normalizedValue === b.normalizedValue) continue;
        const id = conflictIdFor(a, b);
        if (seen.has(id)) continue;
        seen.add(id);
        conflicts.push({
          conflictId: id,
          entityId: a.entityId,
          field: a.field,
          kind: "value_disagreement",
          claims: [a, b],
          status: "open",
          detectedAt,
          surfaceText: conflictSurfaceText(a.entityId, a.field, a, b),
        });
      }
    }
  }
  conflicts.sort((x, y) => x.conflictId.localeCompare(y.conflictId));
  return conflicts;
}

/**
 * Human resolution: records which claim won and who decided. The losing
 * claim is NOT deleted; status flips to "resolved" with the decision trail.
 */
export function resolveConflict(
  conflict: Conflict,
  winningClaimId: string,
  decidedBy: string,
  decidedAt: string,
  note: string,
): Conflict {
  const winner = conflict.claims.find((c) => c.claimId === winningClaimId);
  if (!winner) {
    throw new Error("resolveConflict: winningClaimId is not one of the conflict's claims");
  }
  return {
    ...conflict,
    status: "resolved",
    resolution: { winningClaimId, decidedBy, decidedAt, note },
  };
}
