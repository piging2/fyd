/**
 * Generic evidence drill-down for any rendered object fact.
 *
 * whyThisStepsFor builds the SOURCE -> OBSERVED EVIDENCE -> EXTRACTION
 * METHOD -> STATUS chain from the object's own provenance record. It never
 * invents a link in the chain: a missing or unrecognized link renders as
 * "unknown", and an object with no provenance record at all yields no steps
 * (the WhyThis control then does not render, failing closed).
 *
 * whyThisClaimChainFor builds the focused claim chain the product surface
 * uses: CLAIM (the rendered object title, the component heading) ->
 * SOURCE -> OBSERVED WHEN -> EVIDENCE -> SUPPORT, where SUPPORT is exactly
 * one of DIRECT | DERIVED | OWNER-CONFIRMED. Demo-operator overlays are
 * DIRECT with honest attribution, never mislabeled as owner-confirmed;
 * only actual owner assertions are OWNER-CONFIRMED.
 *
 * Pure functions of PingObject: no customer-specific conditionals, no
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
  return { detail: refUrl(ref) || "unknown", state: "observed" };
}

/**
 * Plain-language evidence sentence (PROD-6, 2026-09-27): what the claim is
 * evidenced by, with no "Provenance ref" jargon. The full record ref stays
 * in the DOM as data-provenance-ref on the disclosure for verification.
 */
function evidenceDetail(o: PingObject): string {
  const prov = o.provenance;
  const when = prov.derivedAt ? ` Observed ${prov.derivedAt.slice(0, 10)}.` : "";
  if (prov.kind === "canonical-journal") {
    return `Recorded in the PING journal as event ${prov.ref}.${when}`;
  }
  if (prov.kind === "overlay-authored") {
    return `Added by a demo operator.${when}`;
  }
  return `Website content captured from ${refUrl(prov.ref) || "unknown"}.${when}`;
}

/** The bare URL inside a "website-ingestion:<url>" style ref. */
function refUrl(ref: string): string {
  const prefixed = ref.match(/^([a-z0-9_-]+):(.*)$/i);
  return prefixed ? prefixed[2] : ref;
}

function methodDetail(o: PingObject): {
  detail: string;
  state?: EvidenceState;
} {
  const method = METHOD_FOR_KIND[o.provenance.kind];
  if (!method) {
    return { detail: "No extraction method recorded for this object." };
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
      detail: "No claim kind recorded for this object.",
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

// ---------------------------------------------------------------------------
// The focused Why This claim chain: CLAIM -> SOURCE -> OBSERVED WHEN ->
// EVIDENCE -> SUPPORT.
//
// CLAIM is the rendered object title: the WhyThis component renders it as
// the chain heading, so the returned steps are the four remaining links.
// Each link is rendered from the object's own provenance and claim kind; a
// missing or unrecognized link renders as "unknown". An object with no
// usable provenance yields [] (the caller omits the affordance), never a
// fabricated chain. Pure function of PingObject: no customer-specific
// conditionals, no schema-specific branches, no lookups beyond the object
// itself.
// ---------------------------------------------------------------------------

/**
 * The SUPPORT link: exactly one of DIRECT | DERIVED | OWNER-CONFIRMED.
 *
 * - OWNER-CONFIRMED: the claim kind is an actual owner assertion
 *   (owner-authored content or an owner override/correction). Wording:
 *   "Confirmed by you", with no SUPPORT-class label prefix. The detail uses the owner-facing language law:
 *   the owner updated the business, so the value changed everywhere FYD
 *   answers (the site, Ask, search, and all projections).
 * - DERIVED: DERIVED_FACT / INFERENCE / GENERATED_COPY: FYD-derived from
 *   the records below, not directly observed.
 * - DIRECT: website-observed or canonical-journal evidence. Website
 *   statements use "Found on your website" (the site's own words, not
 *   independently verified); canonical-journal facts are recorded site
 *   data. Demo-operator overlays are DIRECT with honest attribution
 *   (added by a demo operator, never the website's own words): they are
 *   NEVER mislabeled as owner-confirmed.
 */
export type WhyThisSupport = "DIRECT" | "DERIVED" | "OWNER-CONFIRMED";

/** Claim kinds that are actual owner assertions (not demo overlays). */
const OWNER_ASSERTED_CLAIM_KINDS: ReadonlySet<string> = new Set([
  "owner_authorship",
  "USER_OVERRIDE",
]);

/** Provenance kinds that are actual owner assertions (defensive: the
 *  typed union only lists the three pipeline kinds, but runtime data may
 *  carry these from the ask classifier). */
const OWNER_ASSERTED_PROVENANCE_KINDS: ReadonlySet<string> = new Set([
  "owner-authored",
  "owner-correction",
  "owner",
  "owner_asserted",
]);

/** Claim kinds that are derived/inferred/generated, never direct. */
const DERIVED_CLAIM_KINDS: ReadonlySet<string> = new Set([
  "DERIVED_FACT",
  "derived",
  "INFERENCE",
  "GENERATED_COPY",
]);

function claimKindOf(o: PingObject): string | undefined {
  const fields = (o as { fields?: unknown }).fields;
  if (typeof fields !== "object" || fields === null) return undefined;
  const claimKind = (fields as Record<string, unknown>)["claimKind"];
  return typeof claimKind === "string" ? claimKind : undefined;
}

/**
 * Classify the SUPPORT link for one object: DIRECT | DERIVED |
 * OWNER-CONFIRMED. Owner assertions win over derivation (an owner
 * correction of a derived value is the owner's word); derivation wins
 * over direct (a derived claim is labeled as such even when its inputs
 * were directly observed).
 */
export function supportForClaim(o: PingObject): WhyThisSupport {
  const claimKind = claimKindOf(o);
  if (claimKind !== undefined && OWNER_ASSERTED_CLAIM_KINDS.has(claimKind)) {
    return "OWNER-CONFIRMED";
  }
  const provKind = (o.provenance as { kind?: unknown } | undefined)?.kind;
  if (
    typeof provKind === "string" &&
    OWNER_ASSERTED_PROVENANCE_KINDS.has(provKind)
  ) {
    return "OWNER-CONFIRMED";
  }
  if (claimKind !== undefined && DERIVED_CLAIM_KINDS.has(claimKind)) {
    return "DERIVED";
  }
  return "DIRECT";
}

/** The OBSERVED WHEN link: the observation date, or honest unknown. */
function observedWhenDetail(o: PingObject): {
  detail: string;
  state?: EvidenceState;
} {
  const derivedAt = o.provenance.derivedAt;
  if (typeof derivedAt === "string" && derivedAt.length >= 10) {
    return { detail: `Observed ${derivedAt.slice(0, 10)}.`, state: "observed" };
  }
  return { detail: "No observation date recorded.", state: "unknown" };
}

/** The EVIDENCE link: what the claim is evidenced by, from provenance. */
function claimEvidenceDetail(o: PingObject): {
  detail: string;
  state?: EvidenceState;
} {
  const prov = o.provenance;
  const kind = prov.kind;
  if (kind === "canonical-journal") {
    return {
      detail: `Recorded journal event ${prov.ref}.`,
      state: "observed",
    };
  }
  if (kind === "overlay-authored") {
    return {
      detail: "Added by a demo operator. The addition is logged for verification.",
      state: "inferred",
    };
  }
  // website-derived: the ref carries a "website-ingestion:<url>" shape.
  // The full ref stays in the DOM as data-provenance-ref for verification.
  const url = refUrl(prov.ref);
  return {
    detail: `Website content captured from ${url || "unknown"}.`,
    state: "observed",
  };
}

/** The SUPPORT link: the locked class plus owner-facing wording. */
function supportStep(o: PingObject): { detail: string; state: EvidenceState } {
  const support = supportForClaim(o);
  switch (support) {
    case "OWNER-CONFIRMED":
      return {
        state: "observed",
        detail:
          "Confirmed by you. You updated the business, " +
          "so this value changed everywhere FYD answers: the site, Ask, " +
          "search, and all projections.",
      };
    case "DERIVED":
      return {
        state: "inferred",
        detail: "Worked out by FYD from the records below, not directly observed.",
      };
    default: {
      const kind = o.provenance.kind;
      if (kind === "website-derived") {
        return {
          state: "unverified",
          detail: "Found on your website. The site's own words, not independently verified.",
        };
      }
      if (kind === "overlay-authored") {
        return {
          state: "inferred",
          detail:
            "Added by a demo operator. Not the website's own " +
            "words, and not an owner confirmation.",
        };
      }
      return {
        state: "observed",
        detail: "Recorded in the site data.",
      };
    }
  }
}

/**
 * Build the focused Why This claim chain for one rendered object fact:
 * CLAIM (the component heading) -> SOURCE -> OBSERVED WHEN -> EVIDENCE ->
 * SUPPORT (DIRECT | DERIVED | OWNER-CONFIRMED). Returns [] when the object
 * carries no usable provenance, never a fabricated chain.
 */
export function whyThisClaimChainFor(o: PingObject): EvidenceStep[] {
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
  const observedWhen = observedWhenDetail(obj);
  const evidence = claimEvidenceDetail(obj);
  const support = supportStep(obj);
  return [
    { step: "Source", detail: source.detail, state: source.state },
    { step: "Observed when", detail: observedWhen.detail, state: observedWhen.state },
    { step: "Evidence", detail: evidence.detail, state: evidence.state },
    { step: "Support", detail: support.detail, state: support.state },
  ];
}
