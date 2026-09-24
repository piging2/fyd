/**
 * LANE-OWNER: owner corrections as assertions (CONFIRM / CORRECT / HIDE).
 *
 * A correction is stored as an OwnerAssertion: the operation, the fact it
 * targets, the owner's value (for CORRECT), full provenance (owner,
 * timestamp, supersedes), and the source value the owner saw when
 * asserting (sourceValueSeen).
 *
 * Semantics, frozen:
 *
 * - Assertions are APPEND-ONLY records. Nothing is edited or deleted; a
 *   newer assertion names the older one in provenance.supersedes, and
 *   apply logic only applies chain heads. An old correction can neither
 *   silently win nor silently lose.
 * - REGENERATION: applyCorrections projects assertions over FRESHLY
 *   extracted facts. The source is re-observed, the assertions replay on
 *   top, so a source refresh preserves owner corrections by construction.
 * - CONFLICT: when the source's CURRENT value for a CORRECTed or
 *   CONFIRMEd field differs from sourceValueSeen AND differs from the
 *   owner's asserted value, a CorrectionConflict is surfaced with both
 *   values. The owner's value stays applied (corrections are preserved),
 *   but the conflict is explicit: never a silent win for either side.
 *   When the source has since adopted the owner's value, there is no
 *   conflict: the assertion is satisfied.
 * - HIDE does not change the fact's value. It is consumed by the
 *   visibility layer (./visibility-policy.ts), which keeps FACT and
 *   VISIBILITY separate.
 *
 * Relationship to existing machinery (extend, do not duplicate):
 * src/fyd/object/owner-events.ts already journalizes confirmed/corrected/
 * hid/restored events per object with an append-only log and a reducer.
 * This file is the pure, dependency-free assertion algebra that the
 * conversational compiler (../customize/) reasons over and that converts
 * 1:1 to those events: op CONFIRM -> owner.confirmed-fact,
 * CORRECT -> owner.corrected-fact, HIDE -> owner.hid-fact.
 * The object layer owns the DURABLE store and the read-seam composition;
 * this file owns the typed operations and the conflict algebra.
 *
 * Pure, deterministic, browser-safe.
 */

import { canonicalJson, shortId, type OwnerProvenance } from "./provenance";
import { factIdFor, type SiteFact } from "./facts";

/** The three owner operations on a site fact. */
export type CorrectionOp = "CONFIRM" | "CORRECT" | "HIDE";

/** Addresses one element of one object field. */
export interface FactRef {
  objectId: string;
  field: string;
  /** Element index for array-valued fields; defaults to 0. */
  index?: number;
}

/**
 * One owner assertion. Stored, never mutated. The assertionId is
 * deterministic: "oa-" + sha256 of the canonical assertion body, so the
 * same assertion drafted twice (same clock) is the same record, and
 * supersedes chains are stable across replays.
 */
export interface OwnerAssertion {
  assertionId: string;
  factRef: FactRef;
  op: CorrectionOp;
  /** The owner's value. Set for CORRECT, null otherwise. */
  value: string | null;
  provenance: OwnerProvenance;
  /**
   * What the source said when the owner asserted. The conflict detector
   * compares this against the source's current value. Null when the
   * source had no value (or the asserter did not record it).
   */
  sourceValueSeen: string | null;
}

export interface AssertCorrectionInput {
  factRef: FactRef;
  op: CorrectionOp;
  /** Required for CORRECT: the owner's corrected value. */
  value?: string;
  provenance: OwnerProvenance;
  sourceValueSeen?: string | null;
}

/** Normalize a FactRef so ids are stable (index defaults to 0). */
export function normalizeFactRef(ref: FactRef): Required<FactRef> {
  return {
    objectId: ref.objectId,
    field: ref.field,
    index: ref.index ?? 0,
  };
}

/** The factId an assertion addresses. */
export function assertionFactId(a: Pick<OwnerAssertion, "factRef">): string {
  const r = normalizeFactRef(a.factRef);
  return factIdFor(r.objectId, r.field, r.index);
}

/**
 * Draft one assertion. Refuses honestly: CORRECT requires a non-empty
 * value; CONFIRM and HIDE must not carry one.
 */
export function assertCorrection(input: AssertCorrectionInput): OwnerAssertion {
  const factRef = normalizeFactRef(input.factRef);
  let value: string | null = null;
  if (input.op === "CORRECT") {
    const v = (input.value ?? "").trim();
    if (!v) {
      throw new Error(
        "assertCorrection: CORRECT requires a non-empty corrected value.",
      );
    }
    value = v;
  } else if (input.value !== undefined && input.value !== null) {
    throw new Error(
      "assertCorrection: op " + input.op + " does not take a value; use CORRECT.",
    );
  }
  const sourceValueSeen =
    input.sourceValueSeen === undefined ? null : input.sourceValueSeen;
  const assertionId = shortId(
    "oa-",
    canonicalJson({
      factRef,
      op: input.op,
      value,
      provenance: input.provenance,
      sourceValueSeen,
    }),
  );
  return {
    assertionId,
    factRef,
    op: input.op,
    value,
    provenance: input.provenance,
    sourceValueSeen,
  };
}

/**
 * A surfaced conflict: the source changed the same field after the owner
 * asserted. Both values are carried; the projection keeps the owner's
 * value applied (corrections survive regen) AND lists the conflict, so
 * neither side wins silently.
 */
export interface CorrectionConflict {
  assertionId: string;
  factRef: Required<FactRef>;
  /** What the source says now. */
  sourceValue: string;
  /** What the owner asserted (CORRECT value, or the confirmed value). */
  ownerValue: string;
  assertedAt: string;
  reason: string;
}

export interface AppliedAssertion {
  assertionId: string;
  op: CorrectionOp;
  factId: string;
}

export interface OrphanedAssertion {
  assertionId: string;
  reason: string;
}

export interface CorrectionsResult {
  /** Projected facts: fresh records, corrections composed over the source. */
  facts: SiteFact[];
  /**
   * factIds hidden by HIDE assertions. Consumed by the visibility layer;
   * kept separate so FACT and VISIBILITY never collapse.
   */
  hiddenFactIds: string[];
  conflicts: CorrectionConflict[];
  applied: AppliedAssertion[];
  orphaned: OrphanedAssertion[];
}

function groupKey(ref: Required<FactRef>): string {
  return ref.objectId + "|" + ref.field + "|" + ref.index;
}

/**
 * Chain heads: assertions no other assertion in the same group supersedes.
 * Only heads apply. Deterministic order: assertedAt, then assertionId.
 */
export function chainHeads(assertions: OwnerAssertion[]): OwnerAssertion[] {
  const superseded = new Set<string>();
  for (const a of assertions) {
    if (a.provenance.supersedes) superseded.add(a.provenance.supersedes);
  }
  return assertions
    .filter((a) => !superseded.has(a.assertionId))
    .sort((a, b) =>
      a.provenance.assertedAt < b.provenance.assertedAt
        ? -1
        : a.provenance.assertedAt > b.provenance.assertedAt
          ? 1
          : a.assertionId < b.assertionId
            ? -1
            : 1,
    );
}

/**
 * Project assertions over freshly extracted facts. Pure: returns new fact
 * records, never mutates inputs. Call this after every regeneration: the
 * same assertions over new source facts preserve owner intent, and source
 * changes to asserted fields surface as conflicts.
 */
export function applyCorrections(
  facts: SiteFact[],
  assertions: OwnerAssertion[],
): CorrectionsResult {
  const byId = new Map(facts.map((f) => [f.factId, f] as const));
  const projected: SiteFact[] = facts.map((f) => ({ ...f }));
  const byProjectedId = new Map(projected.map((f) => [f.factId, f] as const));
  const hiddenFactIds: string[] = [];
  const conflicts: CorrectionConflict[] = [];
  const applied: AppliedAssertion[] = [];
  const orphaned: OrphanedAssertion[] = [];

  // Group heads by fact so multiple heads on one fact apply in order.
  const groups = new Map<string, OwnerAssertion[]>();
  for (const head of chainHeads(assertions)) {
    const key = groupKey(normalizeFactRef(head.factRef));
    const list = groups.get(key);
    if (list) list.push(head);
    else groups.set(key, [head]);
  }

  for (const heads of groups.values()) {
    for (const a of heads) {
      const factId = assertionFactId(a);
      const fact = byProjectedId.get(factId);
      const sourceFact = byId.get(factId);
      if (!fact || !sourceFact) {
        orphaned.push({
          assertionId: a.assertionId,
          reason:
            "fact " +
            factId +
            " (" +
            a.factRef.objectId +
            " : " +
            a.factRef.field +
            ") is not in the current extraction; assertion kept, not applied, not dropped.",
        });
        continue;
      }
      const current = sourceFact.value;
      const seen = a.sourceValueSeen;

      if (a.op === "HIDE") {
        if (!hiddenFactIds.includes(factId)) hiddenFactIds.push(factId);
        applied.push({ assertionId: a.assertionId, op: a.op, factId });
        continue;
      }

      if (a.op === "CONFIRM") {
        if (seen !== null && current !== seen) {
          conflicts.push({
            assertionId: a.assertionId,
            factRef: normalizeFactRef(a.factRef),
            sourceValue: current,
            ownerValue: seen,
            assertedAt: a.provenance.assertedAt,
            reason:
              "the source changed this field after the owner confirmed it: " +
              "confirmed '" +
              seen +
              "', source now says '" +
              current +
              "'. The confirmation is stale; nothing was changed.",
          });
          continue;
        }
        fact.ownerConfirmation = {
          owner: a.provenance.owner,
          assertedAt: a.provenance.assertedAt,
        };
        applied.push({ assertionId: a.assertionId, op: a.op, factId });
        continue;
      }

      // CORRECT
      const ownerValue = a.value as string;
      if (seen !== null && current !== seen && current !== ownerValue) {
        conflicts.push({
          assertionId: a.assertionId,
          factRef: normalizeFactRef(a.factRef),
          sourceValue: current,
          ownerValue,
          assertedAt: a.provenance.assertedAt,
          reason:
            "the source changed this field after the owner corrected it: " +
            "source said '" +
            seen +
            "' at correction time, owner set '" +
            ownerValue +
            "', source now says '" +
            current +
            "'. The owner's value stays applied; review required.",
        });
      }
      fact.value = ownerValue;
      applied.push({ assertionId: a.assertionId, op: a.op, factId });
    }
  }

  return { facts: projected, hiddenFactIds, conflicts, applied, orphaned };
}
