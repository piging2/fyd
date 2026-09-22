/**
 * Two confidence axes for every rendered binding.
 *
 *  - factConfidence: do we know this is true? Derived from the evidence
 *    behind the bound object (owner attestation > operator-authored >
 *    website statement > unknown provenance).
 *  - presentationConfidence: is this the best way to present it? Starts at
 *    factConfidence and is reduced by presentation risk (generated copy,
 *    media dependence).
 *
 * LAW: presentationConfidence <= factConfidence, always. A binding may not
 * present more confidently than its evidence supports. assertConfidenceLaw
 * throws on any violation; the planner runs it before returning.
 */

import type { PingObject } from "@/lib/ping/types";

export interface ConfidenceRecord {
  bindingId: string;
  factConfidence: number;
  presentationConfidence: number;
  /** Human-readable basis, e.g. "owner-attested field correction". */
  basis: string;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, Math.round(x * 1000) / 1000));
}

/**
 * Fact confidence for one object, from its evidence. Deterministic:
 * a pure function of provenance + owner attestation.
 */
export function factConfidenceForObject(o: PingObject): { value: number; basis: string } {
  if (o.ownerFieldCorrections && o.ownerFieldCorrections.length > 0) {
    return { value: 1.0, basis: "owner-attested field correction" };
  }
  const ref = o.provenance?.ref ?? "";
  if (ref.startsWith("memory:")) {
    return { value: 0.9, basis: "operator-authored dogfood record" };
  }
  if (ref.startsWith("website-ingestion:")) {
    return { value: 0.8, basis: "website statement, unverified" };
  }
  if (ref.startsWith("canonical-journal:") || o.provenance?.kind === "canonical-journal") {
    return { value: 0.95, basis: "canonical journal event" };
  }
  if (ref !== "") {
    return { value: 0.7, basis: "third-party provenance ref" };
  }
  return { value: 0.5, basis: "unknown provenance" };
}

export type PresentationKind = "direct" | "generated" | "media";

/**
 * Presentation confidence: fact confidence reduced by presentation risk.
 * Direct presentation carries no additional risk; generated copy and media
 * dependence each cost confidence. Always <= factConfidence by construction.
 */
export function presentationConfidenceFor(
  factConfidence: number,
  kind: PresentationKind,
): number {
  const penalty = kind === "generated" ? 0.1 : kind === "media" ? 0.05 : 0;
  return clamp01(factConfidence - penalty);
}

/** Build the confidence record for one binding. */
export function confidenceForBinding(
  bindingId: string,
  o: PingObject,
  kind: PresentationKind,
): ConfidenceRecord {
  const fact = factConfidenceForObject(o);
  const presentationConfidence = presentationConfidenceFor(fact.value, kind);
  return {
    bindingId,
    factConfidence: fact.value,
    presentationConfidence,
    basis: fact.basis + (kind === "direct" ? "" : "; " + kind + " presentation"),
  };
}

/**
 * The confidence law, enforced: presentationConfidence <= factConfidence
 * for every record. Throws on the first violation. Values must be finite
 * numbers in [0, 1].
 */
export function assertConfidenceLaw(records: ConfidenceRecord[]): void {
  for (const r of records) {
    for (const [name, v] of [
      ["factConfidence", r.factConfidence],
      ["presentationConfidence", r.presentationConfidence],
    ] as const) {
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
        throw new Error(
          "Confidence law violation: binding \"" + r.bindingId + "\" has invalid " + name + ".",
        );
      }
    }
    if (r.presentationConfidence > r.factConfidence) {
      throw new Error(
        "Confidence law violation: binding \"" + r.bindingId + "\" presents more " +
          "confidently (" + r.presentationConfidence + ") than its evidence supports (" +
          r.factConfidence + ").",
      );
    }
  }
}
