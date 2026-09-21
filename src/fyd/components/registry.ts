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

const BUSINESS = "ping.social.business@1";
const SERVICE = "ping.social.service@1";
const POST = "ping.social.post@1";
const KNOWLEDGE_WEBSITE = "ping.knowledge.website@1";

const DEFINITIONS: FYDComponentDef[] = [
  { name: "Hero", label: "Hero", description: "Identity block: name, category, tagline, primary action.", acceptsSchemas: [BUSINESS], ownerBound: true, requiresData: true },
  { name: "IdentityCard", label: "Identity card", description: "Compact identity card with follow and share actions.", acceptsSchemas: [BUSINESS], ownerBound: true, requiresData: true },
  { name: "BusinessSummary", label: "Business summary", description: "About-style summary from the business description.", acceptsSchemas: [BUSINESS], ownerBound: true, requiresData: true },
  { name: "Services", label: "Services", description: "Card grid of services the business provides.", acceptsSchemas: [SERVICE], ownerBound: false, requiresData: true },
  { name: "Products", label: "Products", description: "Card grid of products the business offers.", acceptsSchemas: ["ping.social.product@1"], ownerBound: false, requiresData: true },
  { name: "Locations", label: "Locations", description: "Where the business operates, as coarse public claims.", acceptsSchemas: ["ping.social.location@1"], ownerBound: false, requiresData: true },
  { name: "People", label: "People", description: "The people behind the business.", acceptsSchemas: ["ping.social.person@1"], ownerBound: false, requiresData: true },
  { name: "Posts", label: "Posts", description: "Recent posts and articles.", acceptsSchemas: [POST, "ping.social.article@1"], ownerBound: false, requiresData: true },
  { name: "ObjectGrid", label: "Object grid", description: "Generic responsive grid for any object list.", acceptsSchemas: [BUSINESS, SERVICE, POST, "ping.social.product@1", "ping.social.location@1", "ping.social.person@1", "ping.social.article@1", KNOWLEDGE_WEBSITE], ownerBound: false, requiresData: true },
  { name: "ObjectFeed", label: "Object feed", description: "Chronological feed of objects, newest first.", acceptsSchemas: [POST, "ping.social.article@1", SERVICE, KNOWLEDGE_WEBSITE], ownerBound: false, requiresData: true },
  { name: "RecentObjects", label: "Recent objects", description: "Latest objects across schemas, newest first.", acceptsSchemas: [POST, "ping.social.article@1", SERVICE, BUSINESS], ownerBound: false, requiresData: true },
  { name: "Contact", label: "Contact", description: "Public contact channels: phone, email, website.", acceptsSchemas: [BUSINESS], ownerBound: true, requiresData: true },
  { name: "Links", label: "Links", description: "Social and website links published by the business.", acceptsSchemas: [BUSINESS], ownerBound: true, requiresData: true },
  { name: "SocialProof", label: "Social proof", description: "Reviews and testimonials, labeled as published claims.", acceptsSchemas: [BUSINESS], ownerBound: true, requiresData: true },
  { name: "CTA", label: "Call to action", description: "Primary action block: visit website or start a conversation.", acceptsSchemas: [BUSINESS, SERVICE], ownerBound: true, requiresData: false },
  { name: "AskFYD", label: "Ask FYD", description: "Question box: ask anything about this business.", acceptsSchemas: [BUSINESS], ownerBound: true, requiresData: false },
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
 * exists, GenericObjectCard otherwise. The knowledge vocabulary projects
 * onto the same roles as the proof vocabulary, so a knowledge service
 * resolves to Services, never the fallback. Never throws, never returns
 * empty.
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
