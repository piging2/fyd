/**
 * Lane B: generic object projection props for Card and Node.
 *
 * The Card and Node components are PURE presentational projections over ONE
 * typed prop: ObjectProjection. It is schema-agnostic: the same shape carries
 * a Business, a Person, or a Service; the components differ only because the
 * underlying projection data differs. This is the data contract Lane C's lab
 * and Lane A's wiring consume.
 *
 * Every factual claim in the projection carries its evidence basis through
 * the EXISTING why-this/evidence machinery (EvidenceState from
 * src/fyd/ui/evidence-state, lineage steps from src/fyd/ui/why-this). A claim
 * with no evidence is state "unknown" and MUST NOT render as fact: the
 * components render the label with an Unknown mark and omit the value.
 *
 * No fake social collage: `people` holds only real related objects from the
 * graph. When the graph has none, the array is empty and the components omit
 * the section entirely rather than inventing people, reactions, or activity.
 */

import type { EvidenceState } from "../ui/evidence-state";
import type { EvidenceStep } from "../ui/why-this";
import type {
  ObjectCapability,
  ObjectMediaView,
  ObjectView,
} from "./types";

/** Re-exported so Card/Node consumers get the capability type from the
 *  projection module alone. */
export type { ObjectCapability };

/** Evidence basis for one visible claim. */
export interface ClaimEvidence {
  /** One of the existing evidence-state labels: observed | inferred |
   *  unverified | unknown | unavailable | withheld. */
  state: EvidenceState;
  /** Quiet source receipt, e.g. "happyplacecarpentry.com". */
  receipt?: string;
  /** ISO date of observation, e.g. "2026-09-21". */
  asOf?: string;
  /** Lineage for the WhyThis drill-down (nearest first). Omit when there is
   *  no lineage; the components then render no drill-down rather than
   *  inventing one. */
  steps?: EvidenceStep[];
}

/** One labeled factual claim: a value that is only as trustworthy as its basis. */
export interface Fact {
  /** Human label, e.g. "Phone", "Service area", "Typical project length". */
  label: string;
  /** The claim text. Rendered ONLY when evidence.state is not "unknown". */
  value: string;
  evidence: ClaimEvidence;
}

/** A REAL related object from the graph (person, location, service...). */
export interface RelatedRef {
  id: string;
  name: string;
  /** Human kind label, e.g. "Person", "Location", "Service". */
  kindLabel: string;
  /** Human predicate, e.g. "Works for", "Located at". */
  relation: string;
  evidence: ClaimEvidence;
}

export interface ContactProjection {
  phone: Fact | null;
  email: Fact | null;
  website: Fact | null;
}

export interface ProvenanceProjection {
  /** Quiet customer-facing line, e.g. "Information observed on happyplacecarpentry.com". */
  label: string;
  /** Source ref, e.g. "website-ingestion:https://happyplacecarpentry.com/". */
  ref: string;
  derivedAt: string;
}

/**
 * The generic projection-data prop for ObjectCard and ObjectNode.
 * Schema-agnostic: Business, Person, Service all flow through the same
 * components with the same prop.
 */
export interface ObjectProjection {
  /** Public object id, e.g. "happy-place". */
  id: string;
  schema: string;
  /** Human kind label: "Business" | "Person" | "Service". */
  kindLabel: string;
  name: string;
  category: Fact | null;
  location: Fact | null;
  /** Evidence-backed description. null when there is no evidence-backed
   *  description: components must not render generated prose. */
  summary: Fact | null;
  /** Key facts: services, license, service area... each with its own basis. */
  facts: Fact[];
  /** Real related objects only. Empty when the graph has none. */
  people: RelatedRef[];
  contact: ContactProjection;
  /**
   * Capabilities drive actions. A capability exists only when the underlying
   * value exists. NO fake buttons: components render actions from this list
   * and nothing else.
   */
  capabilities: ObjectCapability[];
  provenance: ProvenanceProjection;
  /** Sample visitor questions for the Ask surface. Empty when none. */
  sampleQuestions: string[];
  /** When the owner has made decisions; null when untouched. */
  ownerUpdatedAt: string | null;
  /** Only rights-authorized media; external references excluded from display. */
  media: ObjectMediaView[];
}

function domainOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function asOf(iso: string): string {
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
}

/**
 * Adapt Lane A's ObjectView (business projection) into the generic
 * ObjectProjection Card/Node consume.
 *
 * Basis mapping (honest, never invented):
 * - summary: observed in the website (source state, never generated prose).
 * - category: inferred by Lane A's keyword mapping.
 * - services: "structured" services are directly-structured site data
 *   (service objects linked by provides/offers relationships) -> observed;
 *   owner-added services observed in the owner store. Hidden services are
 *   dropped: the owner chose not to show them. An unrecognized basis kind
 *   maps to "unverified", never silently to a stronger claim.
 * - serviceArea: inferred by Lane A's area parsing.
 * - contact fields: observed in the website fields.
 * - location: withheld when the owner hid the address; observed otherwise.
 *
 * MISMATCH RISK vs Lane A: this adapter reads ObjectView only (types.ts,
 * the shared contract). It does not touch view.ts. If Lane A changes
 * ObjectView's shape, this adapter must change with it; the type system
 * will flag it at build time. (2026-09-21: Lane A changed ServiceBasis
 * from "derived" to "structured" mid-lane; the adapter was updated to
 * match. No LANE_A_DONE coordination file exists yet.)
 */
export function objectViewToProjection(view: ObjectView): ObjectProjection {
  const domain = domainOf(view.contact.website);
  const receipt = domain ?? "the business website";
  const observedAt = asOf(view.provenance.derivedAt);
  const sourceRef = view.provenance.ref;

  const sourceStep = (fieldLabel: string): EvidenceStep[] => [
    { step: "Object field", detail: fieldLabel, state: "observed" },
    { step: "Source", detail: sourceRef || receipt, state: "observed" },
  ];

  const category: Fact | null = view.category
    ? {
        label: "Category",
        value: view.category,
        evidence: {
          state: "inferred",
          receipt: "Website keywords",
          asOf: observedAt,
          steps: [
            {
              step: "Derived",
              detail: "Category mapped from the website's keywords by fixed rules",
              state: "inferred",
            },
            { step: "Source", detail: sourceRef || receipt, state: "observed" },
          ],
        },
      }
    : null;

  const location: Fact | null =
    view.contact.addressVisibility === "hidden"
      ? {
          label: "Location",
          value: "",
          evidence: { state: "withheld", receipt: "Owner visibility choice" },
        }
      : view.locationLabel
        ? {
            label: "Location",
            value: view.locationLabel,
            evidence: {
              state: "observed",
              receipt,
              asOf: observedAt,
              steps: sourceStep("locality"),
            },
          }
        : null;

  const summary: Fact | null = view.summary
    ? {
        label: "About",
        value: view.summary,
        evidence: {
          state: "observed",
          receipt,
          asOf: observedAt,
          steps: sourceStep("description"),
        },
      }
    : null;

  const facts: Fact[] = [];
  for (const s of view.services) {
    if (!s.visible) continue;
    const serviceEvidence: ClaimEvidence =
      s.basis === "owner"
        ? {
            state: "observed",
            receipt: "Added by the owner",
            steps: [
              {
                step: "Owner decision",
                detail: "Added by the owner",
                state: "observed",
              },
            ],
          }
        : s.basis === "structured"
          ? {
              state: "observed",
              receipt: s.basisLabel,
              asOf: observedAt,
              steps: [
                {
                  step: "Service object",
                  detail: s.id + ": " + s.name,
                  state: "observed",
                },
                {
                  step: "Source",
                  detail: sourceRef || receipt,
                  state: "observed",
                },
              ],
            }
          : {
              // Unknown basis kind: never silently upgrade to a stronger
              // claim. The components render this as Unverified.
              state: "unverified",
              receipt: s.basisLabel,
              asOf: observedAt,
            };
    facts.push({ label: "Service", value: s.name, evidence: serviceEvidence });
  }
  for (const area of view.serviceArea) {
    facts.push({
      label: "Service area",
      value: area,
      evidence: {
        state: "inferred",
        receipt: "Parsed from the area_served field",
        asOf: observedAt,
        steps: [
          {
            step: "Derived",
            detail: "Area parsed from the website's area_served field by fixed rules",
            state: "inferred",
          },
          { step: "Source", detail: sourceRef || receipt, state: "observed" },
        ],
      },
    });
  }

  const contactFact = (
    label: string,
    value: string | null,
    fieldLabel: string,
  ): Fact | null =>
    value
      ? {
          label,
          value,
          evidence: {
            state: "observed",
            receipt,
            asOf: observedAt,
            steps: sourceStep(fieldLabel),
          },
        }
      : null;

  return {
    id: view.id,
    schema: view.schema,
    kindLabel: "Business",
    name: view.name,
    category,
    location,
    summary,
    facts,
    people: [],
    contact: {
      phone: contactFact("Phone", view.contact.phone, "phone"),
      email: contactFact("Email", view.contact.email, "email"),
      website: contactFact("Website", view.contact.website, "website"),
    },
    capabilities: view.capabilities,
    provenance: {
      label: view.provenance.label,
      ref: sourceRef,
      derivedAt: view.provenance.derivedAt,
    },
    sampleQuestions: view.sampleQuestions,
    ownerUpdatedAt: view.ownerUpdatedAt,
    media: view.media,
  };
}
