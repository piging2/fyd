/**
 * FYD object projection types.
 *
 * The UI renders a GENERIC object projection, never business-specific code.
 * One object (Happy Place, Coppersmith, ...) flows through the same
 * components; the components differ only because the underlying graphs
 * differ.
 *
 * Layering (never collapsed):
 * - SOURCE STATE: what the PING-backed projection says (digest-verified
 *   journal dump), plus media manifests.
 * - OWNER STATE: durable owner decisions (order, visibility) in the owner
 *   store. Source re-ingestion can never erase owner intent.
 * - DERIVED: deterministic transforms of source state (area parsing,
 *   category mapping). Services are structured records, never prose parses.
 */

import type { RightsSource } from "../media/types";
import type { OwnerFieldCorrection } from "../../lib/ping/types";

export interface ObjectMediaView {
  id: string;
  /** logo | hero | gallery */
  role: string;
  /** Local derivative URL served by FYD (preferred; no hotlink dependency). */
  src: string;
  alt: string;
  /** Rights/source classification, visible in the read model. */
  rightsSource: RightsSource;
  /** Authorization basis sentence; never implies FYD copyright ownership. */
  rightsBasis: string;
  sourceUrl: string;
  digest: string;
  observedAt: string;
}

export type ServiceBasis = "structured" | "owner";

export interface ObjectServiceView {
  /** Stable id: the PING object id for structured services, owner-assigned for owner-added ones. */
  id: string;
  name: string;
  basis: ServiceBasis;
  /** Human basis label, e.g. "From the site data". */
  basisLabel: string;
  visible: boolean;
}

export interface ObjectContactView {
  phone: string | null;
  email: string | null;
  website: string | null;
  /** Coarse public location, e.g. "Adair Village, OR". */
  locality: string | null;
  /**
   * UI-facing display contract (Public/Hidden chips). Derived from
   * the tri-state AddressVisibilityPreference in view.ts: "hide"
   * -> "hidden"; "show" | "default" -> "public".
   */
  addressVisibility: "public" | "hidden";
  /**
   * The owner's explicit SHOW/HIDE/DEFAULT preference (populated by
   * view.ts). Optional so existing view constructors keep compiling;
   * the manage surface uses it for the tri-state control.
   */
  addressVisibilityPreference?: AddressVisibilityPreference;
}

/**
 * Capabilities drive actions. A capability exists only when the underlying
 * value exists. NO fake buttons: the UI renders an action row from this
 * list and nothing else.
 */
export type ObjectCapability =
  | { kind: "view" }
  | { kind: "ask" }
  | { kind: "follow" }
  | { kind: "like" }
  | { kind: "call"; href: string; label: string }
  | { kind: "email"; href: string; label: string }
  | { kind: "website"; href: string; label: string }
  | { kind: "directions"; href: string; label: string }
  | { kind: "reference"; objectId: string };

export interface ObjectProvenanceView {
  kind: string;
  ref: string;
  derivedAt: string;
  /** Quiet customer-facing line, e.g. "Information from happyplacecarpentry.com". */
  label: string;
}

export interface ObjectView {
  /** Public object id, e.g. "happy-place". */
  id: string;
  schema: string;
  name: string;
  category: string | null;
  locationLabel: string | null;
  /** Evidence-backed description (source state, never generated prose). */
  summary: string;
  /** Only rights-authorized media; external references are excluded from display. */
  media: ObjectMediaView[];
  /**
   * Parent business presentation mark, for objects without their own logo.
   * Resolved from graph parent relationships at compose time; the service
   * remains its own object, it just wears the business brand. Null when the
   * object has its own configured mark or no parent business is found.
   */
  fallbackMark?: import("../presentation/identity").PresentationMark | null;
  services: ObjectServiceView[];
  serviceArea: string[];
  contact: ObjectContactView;
  capabilities: ObjectCapability[];
  provenance: ObjectProvenanceView;
  /** When the owner has made decisions; null when untouched. */
  ownerUpdatedAt: string | null;
  /** Sample visitor questions for the Ask surface. */
  sampleQuestions: string[];
  /**
   * Owner-attested field corrections on this object, newest last. Each
   * carries BOTH what the source said and what the owner says
   * (sourceValue vs ownerValue), the correction's own provenance, and
   * whether the source has drifted since. Empty when uncorrected.
   * This is the read model's honest SOURCE SAYS X / OWNER SAYS Y view.
   */
  fieldCorrections: FieldCorrectionView[];
}

/**
 * One field correction as exposed by the read model: the stored owner
 * evidence plus the derived drift flag (true when the source's current
 * value no longer matches what it said at correction time).
 */
export interface FieldCorrectionView extends OwnerFieldCorrection {
  sourceDrifted: boolean;
}

/**
 * The owner's field-level visibility preference for the address
 * (FYD product authority directive, Nolan 2026-09-25: SHOW / HIDE /
 * DEFAULT). SOURCE FACT != OWNER PRESENTATION POLICY: the preference
 * never mutates the source observation or deletes evidence; the
 * public projection boundary computes the effective presentation
 * policy from it (see ../sitespec/public-projection.ts).
 *
 * - "hide":    the address is omitted from the public projection.
 * - "show":    the address is shown verbatim in the public projection.
 * - "default": no explicit owner preference; the conservative
 *             default applies (address-bearing fields coarsen to
 *             city level, never verbatim street detail).
 */
export type AddressVisibilityPreference = "default" | "show" | "hide";

/** Durable owner state. Separate file per object; never overwritten by ingest. */
export interface OwnerOverrides {
  version: 1;
  objectId: string;
  updatedAt: string;
  /** Service ids in owner order. Empty = derived order. */
  serviceOrder: string[];
  hiddenServices: string[];
  addedServices: { id: string; name: string }[];
  /** The owner's SHOW/HIDE/DEFAULT preference for the address field. */
  addressVisibility: AddressVisibilityPreference;
  /**
   * Owner-attested field corrections. Contact corrections are keyed by
   * field ("phone" | "email" | "website") and target the business object;
   * service-description corrections are keyed by their event target
   * ("service-field:<serviceId>") and carry targetObjectId on the record.
   * The correction NEVER rewrites source state: the source projection
   * keeps saying what it says; the read model composes the owner value
   * over it (see src/fyd/object/owner-overlay.ts) and keeps the source
   * value on the record for the SOURCE SAYS X / OWNER SAYS Y distinction.
   */
  fieldCorrections: Record<string, OwnerFieldCorrection>;
  /**
   * Owner-attested field confirmations keyed by field ("phone" | "email" |
   * "website"). A CONFIRM assertion: the owner says the current effective
   * value is correct. Like corrections, it never rewrites evidence: the
   * record keeps the source value at confirmation time (sourceValue) so the
   * read model can surface sourceDrifted when the source later moves.
   * Every record carries the full OwnerAssertion contract below.
   */
  fieldConfirmations: Record<string, FieldConfirmation>;
  /**
   * The owner's address-visibility decision as a persistent assertion
   * (SHOW/HIDE per the presentation-decision directive: the pipeline does
   * not own the presentation decision; the owner does). Null when the
   * owner has never decided. Carries the full OwnerAssertion contract.
   */
  addressVisibilityAssertion: AddressVisibilityAssertion | null;
  /** Human-language log, newest last. */
  history: { at: string; text: string }[];
}

/**
 * The explicit owner-assertion semantic contract
 * (FYD-24H-BUILDER-DECISIONS 2026-09-22, OWNER ASSERTIONS). Every owner
 * assertion in the store shape carries all ten dimensions. The event log
 * is the durable audit seam; this projection is the operational read shape
 * over it. The store is NOT constitutional truth.
 */
export interface OwnerAssertion {
  /** Subject/object: the object id this assertion is about. */
  subject: string;
  /** Field/path: the fact address, e.g. "contact:phone". */
  path: string;
  /** Operation: confirm | correct | hide | show | move | add | restore. */
  operation: string;
  /** The asserted value. */
  value: unknown;
  /** Visibility effect ("unchanged" when the assertion changes none). */
  visibility: string;
  /** The actor the assertion is recorded under. */
  actor: { kind: string; label: string };
  /** ISO timestamp of the assertion. */
  at: string;
  /** Event id of the assertion this one supersedes, or null. */
  supersedes: string | null;
  /** Source/evidence relationship: what the source said and where. */
  evidence: { kind: string; ref: string; detail?: string };
  /** The assertion's own event id in the log. */
  eventId: string;
}

/**
 * One owner CONFIRM assertion as projected over the event log. The
 * confirmed value is the effective value at confirmation time (the owner
 * corrected value when a correction exists, else the source value).
 */
export interface FieldConfirmation extends OwnerAssertion {
  path: "contact:phone" | "contact:email" | "contact:website";
  operation: "confirm";
  value: string | null;
  visibility: "unchanged";
  /** Short field name ("phone" | "email" | "website"). */
  field: "phone" | "email" | "website";
  /** The effective value asserted correct. */
  confirmedValue: string | null;
  /** The source's value at confirmation time (drift baseline). */
  sourceValue: string | null;
  /** Alias of `at`, kept for read-model familiarity. */
  confirmedAt: string;
  /** Alias of `actor.label`, kept for read-model familiarity. */
  actorLabel: string;
}

/**
 * The owner's address presentation decision as a persistent assertion.
 * SHOW/HIDE/CORRECT are owner operations; the pipeline never owns the
 * presentation decision (FYD-24H-BUILDER-DECISIONS 2026-09-22, MEDIA).
 */
export interface AddressVisibilityAssertion extends OwnerAssertion {
  path: "contact:address";
  operation: "hide" | "show" | "default";
  value: "hide" | "show" | "default";
  visibility: "hide" | "show" | "default";
}

export const EMPTY_OVERRIDES = (objectId: string): OwnerOverrides => ({
  version: 1,
  objectId,
  updatedAt: new Date(0).toISOString(),
  serviceOrder: [],
  hiddenServices: [],
  addedServices: [],
  addressVisibility: "default",
  fieldCorrections: {},
  fieldConfirmations: {},
  addressVisibilityAssertion: null,
  history: [],
});

/** Owner commands the Manage surface accepts. All fail closed on bad input. */
export type OwnerCommand =
  | { type: "move-service"; id: string; to: "up" | "down" | "first" | "last" }
  | { type: "set-service-visibility"; id: string; visible: boolean }
  | { type: "add-service"; name: string }
  | { type: "set-address-visibility"; visibility: AddressVisibilityPreference }
  | { type: "set-contact-field"; field: "phone" | "email" | "website"; value: string }
  | { type: "revert-contact-field"; field: "phone" | "email" | "website" }
  | { type: "confirm-contact-field"; field: "phone" | "email" | "website" }
  | { type: "set-service-description"; serviceId: string; value: string }
  | { type: "revert-service-description"; serviceId: string };

/**
 * Circle background: a tiny website-photo derivative when authorized site
 * media exists, otherwise a deterministic gradient fallback. Both variants
 * carry digest + observedAt so the projection can prove its background.
 */
export type CircleBackground =
  | { kind: "image"; src: string; digest: string; observedAt: string; basis: string }
  | { kind: "gradient"; css: string; digest: string; observedAt: string; basis: string };
export interface CircleProjection {
  id: string;
  name: string;
  category: string | null;
  locationLabel: string | null;
  tagline: string;
  topFacts: string[];
  background: CircleBackground;
  capabilities: ObjectCapability[];
  provenanceLabel: string;
  provenanceDetail: string;
  sampleQuestions: string[];
}
