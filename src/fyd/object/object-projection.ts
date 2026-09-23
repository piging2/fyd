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
import type { ObjectGraph } from "../sitespec/types";
import { SCHEMA_ROLES } from "../sitespec/schemas";
import { resolveSafeLink } from "../sitespec/safe-link";
import { selectRelatedCircles } from "./related";

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

/**
 * A contact channel as a first-class object projection.
 *
 * Phone/email are not bare strings on the generated surface: each is a
 * ContactMethod carrying its kind, its binding-verified display value,
 * its evidence basis (refs + verification state), and a safety-gated
 * action URI. The actionUri is valid ONLY inside the FYD contact flow;
 * the generated surface never renders it as a top-level link. An
 * unverifiable or unsafe number/email is not a ContactMethod at all:
 * contactMethodFor returns null and the caller renders nothing.
 */
export type ContactMethodKind = "phone" | "email";

export interface ContactMethod {
  kind: ContactMethodKind;
  /** Human label, e.g. "Phone" / "Email". Generic, never business-specific. */
  label: string;
  /** Binding-verified display value, e.g. "+1 (970) 555-0100". */
  value: string;
  /**
   * Safe tel:/mailto: URI, resolved through the safe-link gate. Valid
   * ONLY inside the FYD contact flow (FydContactLink); never a top-level
   * href on the generated surface.
   */
  actionUri: string;
  /** Evidence basis: verification state, receipt, as-of, lineage steps. */
  evidence: ClaimEvidence;
}

/**
 * Build a ContactMethod from a verified value. Pure and deterministic:
 * no I/O, no clock, no randomness.
 *
 * Returns null when there is no value or the value fails the unsafe-URL
 * gate (resolveSafeLink: parser-based, per-capability allowlist). The
 * gate is never weakened here: hostile values are non-methods, so the
 * surface renders nothing for them.
 */
export function contactMethodFor(
  kind: ContactMethodKind,
  value: string | null | undefined,
  evidence: ClaimEvidence,
): ContactMethod | null {
  if (value === undefined || value === null || value.trim() === "") return null;
  const link = resolveSafeLink(value, kind === "phone" ? "call" : "email");
  if (link.kind !== "safe") return null;
  return {
    kind,
    label: kind === "phone" ? "Phone" : "Email",
    value,
    actionUri: link.href,
    evidence,
  };
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
  /** Human kind label derived from the object schema, e.g. "Business",
   *  "Person", "Service", "Location". */
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
  /** External identity links (links_to), e.g. a linked website profile.
   *  Empty when the graph has none. */
  externalIdentities: RelatedRef[];
  /** Services as clickable related objects (provides/offers edges, owner
   *  visibility and order preserved). Empty when the graph has none. */
  serviceRefs: RelatedRef[];
  /** Location as a clickable related object. null when the graph has none
   *  or the owner withheld the address. */
  locationRef: RelatedRef | null;
  contact: ContactProjection;
  /**
   * Phone/email as first-class actionable projections, each carrying its
   * evidence basis and a safety-gated action URI. Deterministic order:
   * phone, email. Empty when the graph has no safe contact values.
   * Downstream surfaces render these through the FYD contact flow
   * (FydContactLink), never as top-level tel:/mailto: links.
   */
  contactMethods: ContactMethod[];
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

/** Schema for external identity links. Not in SCHEMA_ROLES; matched directly. */
const EXTERNAL_IDENTITY_SCHEMA = "ping.social.external_identity@1";

/** Predicates that connect a person to the business they work for. */
const PERSON_PREDICATES = ["works_for", "has_team_member", "employs"];

/** Predicates that connect a business to the services it offers. */
const SERVICE_PREDICATES = ["provides", "offers"];

/** Human labels for relationship predicates. Unknown predicates render as-is. */
const RELATION_LABELS: Record<string, string> = {
  provides: "Provides",
  offers: "Offers",
  located_at: "Located at",
  works_for: "Works for",
  has_team_member: "Team member",
  employs: "Employs",
  links_to: "Linked profile",
};

function kindLabelFor(schema: string): string {
  if (SCHEMA_ROLES.business.includes(schema)) return "Business";
  if (SCHEMA_ROLES.service.includes(schema)) return "Service";
  if (SCHEMA_ROLES.person.includes(schema)) return "Person";
  if (SCHEMA_ROLES.location.includes(schema)) return "Location";
  if (schema === EXTERNAL_IDENTITY_SCHEMA) return "External identity";
  return schema;
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
 * - people / externalIdentities / serviceRefs / locationRef: populated ONLY
 *   when the tenant ObjectGraph is provided, from real active relationships
 *   (works_for -> person, links_to -> external identity, provides/offers ->
 *   service, located_at -> location). The relationship selection reuses the
 *   related.ts predicate vocabulary and fail-closed rules (active edges
 *   only, public objects only, never the business itself, deterministic
 *   canonical edge order). Without a graph these stay empty/null, exactly
 *   as before.
 *
 * MISMATCH RISK vs Lane A: this adapter reads ObjectView only (types.ts,
 * the shared contract). It does not touch view.ts. If Lane A changes
 * ObjectView's shape, this adapter must change with it; the type system
 * will flag it at build time. (2026-09-21: Lane A changed ServiceBasis
 * from "derived" to "structured" mid-lane; the adapter was updated to
 * match. No LANE_A_DONE coordination file exists yet.)
 */
export function objectViewToProjection(
  view: ObjectView,
  graph?: ObjectGraph,
): ObjectProjection {
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

  // --- Graph relationship join (the data-gap fix) ---
  // Populated only from real active relationships; without a graph every
  // group stays empty, exactly as before.
  let people: RelatedRef[] = [];
  let externalIdentities: RelatedRef[] = [];
  let serviceRefs: RelatedRef[] = [];
  let locationRef: RelatedRef | null = null;

  if (graph) {
    const byId = new Map(graph.objects.map((o) => [o.id, o]));
    // By-id views carry the PING object id; slug views carry the site slug,
    // so fall back to the tenant's public business object (mirrors the
    // slug-keyed loader's find in view.ts).
    const biz =
      byId.get(view.id) ??
      graph.objects.find(
        (o) => SCHEMA_ROLES.business.includes(o.schema) && o.visibility === "public",
      );
    if (biz) {
      // Canonical edge order so evidence resolution never depends on dump order.
      const activeEdges = graph.relationships
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
      const edgeFor = (candidateId: string, predicate: string) =>
        activeEdges.find(
          (r) =>
            r.predicate === predicate &&
            (r.subject === candidateId || r.object === candidateId),
        );
      const relEvidence = (evidenceRef: string): ClaimEvidence => ({
        state: "observed",
        receipt,
        asOf: observedAt,
        steps: [
          { step: "Relationship", detail: evidenceRef, state: "observed" },
          { step: "Source", detail: sourceRef || receipt, state: "observed" },
        ],
      });

      // The selectRelatedCircles candidate set: honest, deduped, public-only.
      for (const c of selectRelatedCircles(graph, biz.id)) {
        const obj = byId.get(c.objectId);
        if (!obj) continue;
        const rel = edgeFor(c.objectId, c.predicate);
        const ref: RelatedRef = {
          id: obj.id,
          name: obj.title,
          kindLabel: kindLabelFor(obj.schema),
          relation: RELATION_LABELS[c.predicate] ?? c.predicate,
          evidence: relEvidence(rel?.evidenceRef ?? c.predicate),
        };
        if (
          SCHEMA_ROLES.person.includes(obj.schema) &&
          PERSON_PREDICATES.includes(c.predicate)
        ) {
          people.push(ref);
        } else if (
          obj.schema === EXTERNAL_IDENTITY_SCHEMA &&
          c.predicate === "links_to"
        ) {
          externalIdentities.push(ref);
        } else if (
          SCHEMA_ROLES.service.includes(obj.schema) &&
          SERVICE_PREDICATES.includes(c.predicate)
        ) {
          serviceRefs.push(ref);
        } else if (
          SCHEMA_ROLES.location.includes(obj.schema) &&
          c.predicate === "located_at"
        ) {
          // Owner visibility wins: a hidden address never surfaces a
          // clickable location, mirroring the location Fact above.
          if (view.contact.addressVisibility !== "hidden" && !locationRef) {
            locationRef = ref;
          }
        }
      }

      // Owner visibility and order win for services, exactly as in the
      // facts list above: hidden services never surface as clickable rows.
      const visibleOrder = view.services.filter((s) => s.visible).map((s) => s.id);
      const visibleSet = new Set(visibleOrder);
      serviceRefs = serviceRefs
        .filter((r) => visibleSet.has(r.id))
        .sort((a, b) => visibleOrder.indexOf(a.id) - visibleOrder.indexOf(b.id));
    }
  }

  // First-class contact methods: phone/email as actionable projections
  // sharing the contact Facts' evidence. The safe-link gate runs inside
  // contactMethodFor: an unsafe number/email is not a method, so the
  // card/node lane renders nothing for it, exactly as the site renderer.
  const phoneFact = contactFact("Phone", view.contact.phone, "phone");
  const emailFact = contactFact("Email", view.contact.email, "email");
  const contactMethods: ContactMethod[] = [];
  const phoneMethod = phoneFact
    ? contactMethodFor("phone", phoneFact.value, phoneFact.evidence)
    : null;
  const emailMethod = emailFact
    ? contactMethodFor("email", emailFact.value, emailFact.evidence)
    : null;
  if (phoneMethod) contactMethods.push(phoneMethod);
  if (emailMethod) contactMethods.push(emailMethod);

  return {
    id: view.id,
    schema: view.schema,
    kindLabel: kindLabelFor(view.schema),
    name: view.name,
    category,
    location,
    summary,
    facts,
    people,
    externalIdentities,
    serviceRefs,
    locationRef,
    contact: {
      phone: phoneFact,
      email: emailFact,
      website: contactFact("Website", view.contact.website, "website"),
    },
    contactMethods,
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
