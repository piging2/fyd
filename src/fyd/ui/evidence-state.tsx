"use client";

/**
 * Evidence-state labels for the customer/owner surface.
 *
 * Harvested pattern: maturity labels (UI harvest spec section 15, P-16/P-17),
 * adapted to the language a business owner and their visitors understand.
 * These label EVIDENCE STATES, not engineering maturity: every visible claim
 * on a node carries one, with its receipt (where it came from) and as-of
 * date on hover.
 *
 * Deliberately NOT the operator-console vocabulary (Live/Built/Experimental
 * etc. in src/components/maturity-label.tsx). That component serves the
 * operator console; this one serves the customer surface.
 */

export type EvidenceState =
  | "observed" // seen in the source, with a receipt
  | "inferred" // derived by deterministic rules from observed evidence
  | "unverified" // claimed by the source, not yet checked
  | "unknown" // no evidence either way
  | "unavailable" // evidence could not be read
  | "withheld"; // hidden by the owner's visibility choice

const LABELS: Record<EvidenceState, string> = {
  observed: "Observed",
  inferred: "Inferred",
  unverified: "Unverified",
  unknown: "Unknown",
  unavailable: "Unavailable",
  withheld: "Hidden by owner",
};

const HINTS: Record<EvidenceState, string> = {
  observed: "Seen in the source. Hover the Why this link for the receipt.",
  inferred: "Derived from observed evidence by fixed rules, not guessed.",
  unverified: "The source claims this. FYD has not checked it.",
  unavailable: "FYD could not read this. Not the same as none.",
  unknown: "FYD has no evidence for this either way.",
  withheld: "The owner chose not to show this. The fact is untouched.",
};

const STYLES: Record<EvidenceState, string> = {
  observed: "bg-emerald-500/10 text-emerald-800 border-emerald-500/30",
  inferred: "bg-sky-500/10 text-sky-800 border-sky-500/30",
  unverified: "bg-amber-500/10 text-amber-800 border-amber-500/30",
  unknown: "bg-zinc-500/10 text-zinc-600 border-zinc-500/30",
  unavailable: "bg-zinc-500/10 text-zinc-600 border-dashed border-zinc-500/40",
  withheld: "bg-violet-500/10 text-violet-800 border-violet-500/30",
};

export function EvidenceStateLabel({
  state,
  receipt,
  asOf,
  className,
}: {
  state: EvidenceState;
  /** Where the evidence came from, e.g. "happyplacecarpentry.com". */
  receipt?: string;
  /** When it was observed, e.g. "2026-09-21". */
  asOf?: string;
  className?: string;
}) {
  const hint = HINTS[state] + (receipt ? ` Source: ${receipt}.` : "") + (asOf ? ` As of ${asOf}.` : "");
  return (
    <span
      title={hint}
      className={
        "inline-block rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide " +
        STYLES[state] +
        (className ? " " + className : "")
      }
    >
      {LABELS[state]}
    </span>
  );
}
