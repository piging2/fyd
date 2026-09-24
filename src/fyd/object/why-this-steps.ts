/**
 * Generic evidence drill-down for any rendered object fact.
 *
 * whyThisStepsFor builds the SOURCE -> OBSERVED EVIDENCE -> EXTRACTION
 * METHOD -> STATUS chain from the object's own provenance record. It never
 * invents a link in the chain: a missing or unrecognized link renders as
 * "unknown", and an object with no provenance record at all yields no steps
 * (the WhyThis control then does not render, failing closed).
 *
 * Pure function of PingObject: no customer-specific conditionals, no
 * schema-specific branches, no lookups beyond the object itself.
 */

import type { PingObject, ObjectProvenanceKind } from "@/lib/ping/types";
import type { EvidenceState } from "../ui/evidence-state";
import type { EvidenceStep } from "../ui/why-this";

/** Fixed, deterministic mapping: provenance kind -> extraction method. */
const METHOD_FOR_KIND: Record<ObjectProvenanceKind, string> = {
  "website-derived":
    "Website ingestion: structured extraction from the source site",
  "canonical-journal": "Canonical journal: recorded PING event",
  "overlay-authored": "Owner overlay: added by a demo operator",
};

/** Fixed mapping: the object's claim kind -> honest status label. */
const STATUS_FOR_CLAIM_KIND: Record<
  string,
  { state: EvidenceState; detail: string }
> = {
  website_statement: {
    state: "unverified",
    detail:
      "Website statement: the source claims this. FYD has not independently verified it.",
  },
  feed_item: {
    state: "observed",
    detail: "Feed item: observed in the business feed.",
  },
};

function sourceDetail(o: PingObject): { detail: string; state: EvidenceState } {
  const kind = o.provenance.kind;
  const ref = o.provenance.ref;
  if (kind === "overlay-authored") {
    return {
      detail:
        "Demo overlay: added by a demo operator. Not observed on any external website.",
      state: "inferred",
    };
  }
  if (kind === "canonical-journal") {
    return {
      detail: `PING canonical journal, event ${ref}.`,
      state: "observed",
    };
  }
  // website-derived: the ref carries a "website-ingestion:<url>" shape.
  const prefixed = ref.match(/^([a-z0-9_-]+):(.*)$/i);
  const url = prefixed ? prefixed[2] : ref;
  return { detail: url || "unknown", state: "observed" };
}

function evidenceDetail(o: PingObject): string {
  const prov = o.provenance;
  const when = prov.derivedAt ? ` Observed ${prov.derivedAt}.` : "";
  return `Provenance ref "${prov.ref}".${when}`;
}

function methodDetail(o: PingObject): {
  detail: string;
  state?: EvidenceState;
} {
  const method = METHOD_FOR_KIND[o.provenance.kind];
  if (!method) {
    return { detail: "unknown: no extraction method recorded for this object." };
  }
  return { detail: method, state: "inferred" };
}

function statusStep(o: PingObject): { detail: string; state: EvidenceState } {
  const fields = (o as { fields?: unknown }).fields;
  const claimKind =
    typeof fields === "object" && fields !== null
      ? (fields as Record<string, unknown>)["claimKind"]
      : undefined;
  const mapped =
    typeof claimKind === "string"
      ? STATUS_FOR_CLAIM_KIND[claimKind]
      : undefined;
  return (
    mapped ?? {
      state: "unknown" as EvidenceState,
      detail: "unknown: no claim kind recorded for this object.",
    }
  );
}

/**
 * Build the evidence chain for one rendered object fact. Returns [] when
 * the object carries no usable provenance (caller then omits the
 * affordance), never a fabricated chain.
 */
export function whyThisStepsFor(o: PingObject): EvidenceStep[] {
  const prov = (o as { provenance?: unknown }).provenance;
  if (
    typeof prov !== "object" ||
    prov === null ||
    typeof (prov as { ref?: unknown }).ref !== "string" ||
    (prov as { ref: string }).ref === ""
  ) {
    return [];
  }
  const obj = o as PingObject;
  const source = sourceDetail(obj);
  const method = methodDetail(obj);
  const status = statusStep(obj);
  return [
    { step: "Source", detail: source.detail, state: source.state },
    { step: "Observed evidence", detail: evidenceDetail(obj), state: "observed" },
    { step: "Extraction method", detail: method.detail, state: method.state },
    { step: "Status", detail: status.detail, state: status.state },
  ];
}
