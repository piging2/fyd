/**
 * Component registry: the sixteen section components plus GenericObjectCard.
 *
 * Contract (harvest T5): each entry names the component, the schemas it
 * accepts, and whether it needs the owner. Adding a component means adding
 * one entry here plus one renderer branch. Unknown schemas render through
 * GenericObjectCard, never fail.
 *
 * The registry is the only place that maps schema -> component. The
 * generator asks eligibleComponents(); the validator checks against it;
 * the renderer switches on it. One mapping, three consumers.
 *
 * acceptsSchemas lists are built from the central SCHEMA_ROLES table in
 * ../sitespec/schemas: no schema id is hardcoded here, so the
 * ping.social.* proof vocabulary and the ping.knowledge.* ingestion
 * vocabulary are accepted through the same roles.
 */

import { SCHEMA_ROLES, schemaRole } from "../sitespec/schemas";

export interface FYDComponentDef {
  /** Registry name, used in FYDSection.component. */
  name: string;
  label: string;
  description: string;
  /** Schema ids this component can render. */
  acceptsSchemas: string[];
  /** True when the component renders the site owner rather than a list. */
  ownerBound: boolean;
  /** True when the section renders nothing without resolved objects. */
  requiresData: boolean;
}

const KNOWLEDGE_WEBSITE = "ping.knowledge.website@1";

const DEFINITIONS: FYDComponentDef[] = [
  { name: "Hero", label: "Hero", description: "Identity block: name, category, tagline, primary action.", acceptsSchemas: SCHEMA_ROLES.business, ownerBound: true, requiresData: true },
  { name: "IdentityCard", label: "Identity card", description: "Compact identity card with follow and share actions.", acceptsSchemas: SCHEMA_ROLES.business, ownerBound: true, requiresData: true },
  { name: "BusinessSummary", label: "Business summary", description: "About-style summary from the business description.", acceptsSchemas: SCHEMA_ROLES.business, ownerBound: true, requiresData: true },
  { name: "Services", label: "Services", description: "Card grid of services the business provides.", acceptsSchemas: SCHEMA_ROLES.service, ownerBound: false, requiresData: true },
  { name: "Products", label: "Products", description: "Card grid of products the business offers.", acceptsSchemas: SCHEMA_ROLES.product, ownerBound: false, requiresData: true },
  { name: "Locations", label: "Locations", description: "Where the business operates, as coarse public claims.", acceptsSchemas: SCHEMA_ROLES.location, ownerBound: false, requiresData: true },
  { name: "People", label: "People", description: "The people behind the business.", acceptsSchemas: SCHEMA_ROLES.person, ownerBound: false, requiresData: true },
  { name: "Posts", label: "Posts", description: "Recent posts and articles.", acceptsSchemas: [...SCHEMA_ROLES.post, ...SCHEMA_ROLES.article], ownerBound: false, requiresData: true },
  { name: "ObjectGrid", label: "Object grid", description: "Generic responsive grid for any object list.", acceptsSchemas: [...SCHEMA_ROLES.business, ...SCHEMA_ROLES.service, ...SCHEMA_ROLES.product, ...SCHEMA_ROLES.location, ...SCHEMA_ROLES.person, ...SCHEMA_ROLES.post, ...SCHEMA_ROLES.article, KNOWLEDGE_WEBSITE], ownerBound: false, requiresData: true },
  { name: "ObjectFeed", label: "Object feed", description: "Chronological feed of objects, newest first.", acceptsSchemas: [...SCHEMA_ROLES.post, ...SCHEMA_ROLES.article, ...SCHEMA_ROLES.service, KNOWLEDGE_WEBSITE], ownerBound: false, requiresData: true },
  { name: "RecentObjects", label: "Recent objects", description: "Latest objects across schemas, newest first.", acceptsSchemas: [...SCHEMA_ROLES.post, ...SCHEMA_ROLES.article, ...SCHEMA_ROLES.service, ...SCHEMA_ROLES.business], ownerBound: false, requiresData: true },
  { name: "Contact", label: "Contact", description: "Public contact channels: phone, email, website.", acceptsSchemas: SCHEMA_ROLES.business, ownerBound: true, requiresData: true },
  { name: "Links", label: "Links", description: "Social and website links published by the business.", acceptsSchemas: SCHEMA_ROLES.business, ownerBound: true, requiresData: true },
  { name: "SocialProof", label: "Social proof", description: "Reviews and testimonials, labeled as published claims.", acceptsSchemas: SCHEMA_ROLES.business, ownerBound: true, requiresData: true },
  { name: "CTA", label: "Call to action", description: "Primary action block: visit website or start a conversation.", acceptsSchemas: [...SCHEMA_ROLES.business, ...SCHEMA_ROLES.service], ownerBound: true, requiresData: false },
  { name: "AskFYD", label: "Ask FYD", description: "Question box: ask anything about this business.", acceptsSchemas: SCHEMA_ROLES.business, ownerBound: true, requiresData: false },
  { name: "GenericObjectCard", label: "Generic object card", description: "Fallback renderer for schemas with no dedicated component.", acceptsSchemas: [], ownerBound: false, requiresData: true },
];

const BY_NAME = new Map(DEFINITIONS.map((d) => [d.name, d]));

export function getComponentDef(name: string): FYDComponentDef | undefined {
  return BY_NAME.get(name);
}

export function listComponentDefs(): FYDComponentDef[] {
  return DEFINITIONS.slice();
}

/**
 * Resolve the component for a schema. Dedicated component when one
 * exists, GenericObjectCard otherwise. Acceptance lists are built from
 * SCHEMA_ROLES, so a knowledge service matches Services directly; the
 * role fallback below stays for schemas listed nowhere. Never throws,
 * never returns empty.
 */
export function componentForSchema(schemaId: string): string {
  const dedicated = DEFINITIONS.find(
    (d) => d.name !== "GenericObjectCard" && d.acceptsSchemas.includes(schemaId),
  );
  if (dedicated) return dedicated.name;
  const role = schemaRole(schemaId);
  if (role) {
    const proofId = SCHEMA_ROLES[role][0];
    const viaRole = DEFINITIONS.find(
      (d) => d.name !== "GenericObjectCard" && d.acceptsSchemas.includes(proofId),
    );
    if (viaRole) return viaRole.name;
  }
  return "GenericObjectCard";
}
