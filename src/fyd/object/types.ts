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
  addressVisibility: "public" | "hidden";
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
  | { kind: "website"; href: string; label: string };

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

/** Durable owner state. Separate file per object; never overwritten by ingest. */
export interface OwnerOverrides {
  version: 1;
  objectId: string;
  updatedAt: string;
  /** Service ids in owner order. Empty = derived order. */
  serviceOrder: string[];
  hiddenServices: string[];
  addedServices: { id: string; name: string }[];
  addressVisibility: "public" | "hidden";
  /**
   * Owner-attested field corrections keyed by field ("phone" | "email" |
   * "website"). The correction NEVER rewrites source state: the source
   * projection keeps saying what it says; the read model composes the
   * owner value over it (see src/fyd/object/owner-overlay.ts) and keeps
   * the source value on the record for the SOURCE SAYS X / OWNER SAYS Y
   * distinction.
   */
  fieldCorrections: Record<string, OwnerFieldCorrection>;
  /** Human-language log, newest last. */
  history: { at: string; text: string }[];
}

export const EMPTY_OVERRIDES = (objectId: string): OwnerOverrides => ({
  version: 1,
  objectId,
  updatedAt: new Date(0).toISOString(),
  serviceOrder: [],
  hiddenServices: [],
  addedServices: [],
  addressVisibility: "public",
  fieldCorrections: {},
  history: [],
});

/** Owner commands the Manage surface accepts. All fail closed on bad input. */
export type OwnerCommand =
  | { type: "move-service"; id: string; to: "up" | "down" | "first" | "last" }
  | { type: "set-service-visibility"; id: string; visible: boolean }
  | { type: "add-service"; name: string }
  | { type: "set-address-visibility"; visibility: "public" | "hidden" }
  | { type: "set-contact-field"; field: "phone" | "email" | "website"; value: string }
  | { type: "revert-contact-field"; field: "phone" | "email" | "website" };

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
