/**
 * H3 lane: failure-honesty gate for DEMO owner attestations.
 *
 * PROVENANCE (harvested pattern, not copied PING code):
 *   SOURCE: ~/workspace/fyd-lane/absorb/src/attestation-gate.ts (C4),
 *           itself harvested from /home/nolan/ping
 *           ping-runtime/workers/canonical_workers.js:451-510
 *           (WitnessWorker.handle, the "W7" failure-honesty gate: on
 *           REPLAY_COMPLETED with verified !== true, the worker REFUSES to
 *           attest and emits WITNESS_REJECTED - it never fabricates an
 *           attestation.)
 * This file re-implements the pattern as a dependency-free pure function
 * for the FYD demo. No PING runtime import.
 *
 * FYD form of Nolan's truth-model law ("missing evidence NEVER becomes
 * HEALTHY"): every owner attestation checks its evidence preconditions
 * FIRST. On missing evidence the gate returns ATTESTATION_REJECTED with a
 * reason and the emit callback is NEVER invoked - no success claim is
 * produced, observed, or implied.
 *
 * DEMO SCOPE: used only by DEMO OWNER MODE (see ./gate.ts). This gate
 * proves an attestation's evidence was present; it does not authenticate
 * the attester.
 */

export type AttestationKind = 'regen-complete' | 'correction-survived' | 'refresh-applied';

/**
 * Evidence preconditions per attestation kind. An attestation is a DERIVED
 * claim: it may only exist when every named precondition is present.
 */
const PRECONDITIONS: Record<AttestationKind, readonly string[]> = {
  'regen-complete': ['approved_transition_id', 'rendered_sitespec_hash', 'bindings_verified'],
  'correction-survived': ['correction_transition_id', 'post_regen_claim_hash', 'binding_verdict'],
  'refresh-applied': ['source_observation_id', 'owner_policy_preserved', 'binding_verdict'],
};

export function preconditionsFor(kind: AttestationKind): readonly string[] {
  const p = (PRECONDITIONS as Record<string, readonly string[]>)[kind];
  if (!p) throw new Error(`attest: unknown attestation kind '${kind}' - refusing to guess preconditions`);
  return p;
}

export interface Attestation {
  kind: AttestationKind;
  evidence: Record<string, unknown>;
  attestedAt: string;
}

export type AttestationStatus = 'ATTESTED' | 'ATTESTATION_REJECTED';

export interface AttestationResult {
  status: AttestationStatus;
  kind: AttestationKind;
  /** Typed reason. On rejection: 'missing_evidence:<names>'. On success: null. */
  reason: string | null;
  attestation: Attestation | null;
}

/**
 * Attempt an attestation. Evidence preconditions are checked first; if any is
 * missing (undefined or null - explicit null is NOT evidence), the result is
 * ATTESTATION_REJECTED and `emit` is never called. Success is only reachable
 * through verified preconditions.
 */
export function attest(
  kind: AttestationKind,
  evidence: Record<string, unknown>,
  emit?: (a: Attestation) => void,
  nowIso: () => string = () => new Date().toISOString()
): AttestationResult {
  const required = preconditionsFor(kind);
  const missing = required.filter((name) => evidence[name] === undefined || evidence[name] === null);
  if (missing.length > 0) {
    return {
      status: 'ATTESTATION_REJECTED',
      kind,
      reason: `missing_evidence:${missing.join(',')}`,
      attestation: null,
    };
  }
  const attestation: Attestation = { kind, evidence, attestedAt: nowIso() };
  if (emit) emit(attestation);
  return { status: 'ATTESTED', kind, reason: null, attestation };
}
