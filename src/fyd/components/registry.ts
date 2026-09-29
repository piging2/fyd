/**
 * Component registry: the eighteen section components plus GenericObjectCard.
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
 * ../sitespec/schema-roles (re-exported by ../sitespec/schemas): no schema id is hardcoded here, so the
 * ping.social.* proof vocabulary and the ping.knowledge.* ingestion
 * vocabulary are accepted through the same roles.
 */

import { SCHEMA_ROLES } from "../sitespec/schema-roles";

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
  /**
   * Optional structured metadata for the composer and owner tooling.
   * Every field is optional so existing entries stay unchanged; new
   * entries declare data, capabilities, responsive constraints, and
   * editable properties for composition reasoning.
   */
  requiredData?: string[];
  capabilities?: string[];
  responsive?: {
    behavior: "rail-to-drawer" | "stack" | "fixed";
    collapseBelow?: string;
    touchTargetMinPx?: number;
  };
  editableProperties?: string[];
  variants?: string[];
  /**
   * Optional operational evidence for the future self-evaluating
   * registry (FUTURE CONTRACT, not evaluated yet): observed usage,
   * failure counts, LCP impact, and the graph shapes this component
   * serves well or poorly. Every field is optional and every entry
   * leaves them unpopulated until the evaluation machinery exists.
   */
  operationalEvidence?: {
    usage?: number;
    failureCount?: number;
    lcpImpactMs?: number;
    bestGraphShapes?: string[];
    poorGraphShapes?: string[];
  };
}

/**
 * Registry version, stamped on every dependency-manifest binding so a
 * component change can be traced to the specs it affected.
 */
export const COMPONENT_REGISTRY_VERSION = "fyd-component-registry@1";

const KNOWLEDGE_WEBSITE = "ping.knowledge.website@1";

const DEFINITIONS: FYDComponentDef[] = [
  ...["EditorialHero", "EditorialAtlas", "EditorialKnowledge", "EditorialPublications", "EditorialStory", "EditorialProof"].map(name => ({
    name, label: name, description: "Editorial presentation of verified public records and separate presentation intent.",
    acceptsSchemas: [...SCHEMA_ROLES.business, ...SCHEMA_ROLES.product, ...SCHEMA_ROLES.service, ...SCHEMA_ROLES.person, ...SCHEMA_ROLES.article],
    ownerBound: false, requiresData: ["EditorialHero", "EditorialAtlas", "EditorialKnowledge", "EditorialPublications"].includes(name),
  })),
  { name: "Hero", label: "Hero", description: "Identity block: name, category, tagline, primary action.", acceptsSchemas: SCHEMA_ROLES.business, ownerBound: true, requiresData: true },
  { name: "IdentityCard", label: "Identity card", description: "Compact identity card for the business. (Follow/share are unwired: no UI renders them.)", acceptsSchemas: SCHEMA_ROLES.business, ownerBound: true, requiresData: true },
  { name: "BusinessSummary", label: "Business summary", description: "About-style summary from the business description.", acceptsSchemas: SCHEMA_ROLES.business, ownerBound: true, requiresData: true },
  { name: "Services", label: "Services", description: "Card grid of services the business provides.", acceptsSchemas: SCHEMA_ROLES.service, ownerBound: false, requiresData: true },
  { name: "Products", label: "Products", description: "Card grid of products the business offers.", acceptsSchemas: SCHEMA_ROLES.product, ownerBound: false, requiresData: true },
  { name: "Locations", label: "Locations", description: "Where the business operates, as coarse public claims.", acceptsSchemas: SCHEMA_ROLES.location, ownerBound: false, requiresData: true },
  { name: "People", label: "People", description: "The people behind the business.", acceptsSchemas: SCHEMA_ROLES.person, ownerBound: false, requiresData: true },
  { name: "Posts", label: "Posts", description: "Recent posts and articles.", acceptsSchemas: [...SCHEMA_ROLES.post, ...SCHEMA_ROLES.article], ownerBound: false, requiresData: true },
  { name: "ObjectGrid", label: "Object grid", description: "Generic responsive grid for any object list.", acceptsSchemas: [...SCHEMA_ROLES.business, ...SCHEMA_ROLES.service, ...SCHEMA_ROLES.product, ...SCHEMA_ROLES.location, ...SCHEMA_ROLES.person, ...SCHEMA_ROLES.post, ...SCHEMA_ROLES.article, KNOWLEDGE_WEBSITE], ownerBound: false, requiresData: true },
  // G1 (2026-09-24): business/product/location/person are feed content again.
  // The 2026-09-23 convergence dropped them from ObjectFeed as "stale drift"
  // at the mechanism level, which silently removed the Explore page for real
  // businesses (bemis-electric, gear-junction: business+person/location graphs).
  // Product semantics win over mechanism convergence: a refactor may change
  // implementation, it must not silently change generated pages. Pinned by
  // the page-inventory test (proceduralize/__tests__/page-inventory.test.ts).
  { name: "ObjectFeed", label: "Object feed", description: "Chronological feed of objects, newest first.", acceptsSchemas: [...SCHEMA_ROLES.business, ...SCHEMA_ROLES.product, ...SCHEMA_ROLES.location, ...SCHEMA_ROLES.person, ...SCHEMA_ROLES.post, ...SCHEMA_ROLES.article, ...SCHEMA_ROLES.service, KNOWLEDGE_WEBSITE], ownerBound: false, requiresData: true },
  { name: "RecentObjects", label: "Recent objects", description: "Latest objects across schemas, newest first.", acceptsSchemas: [...SCHEMA_ROLES.post, ...SCHEMA_ROLES.article, ...SCHEMA_ROLES.service, ...SCHEMA_ROLES.business], ownerBound: false, requiresData: true },
  { name: "Contact", label: "Contact", description: "Public contact channels: phone, email, website.", acceptsSchemas: SCHEMA_ROLES.business, ownerBound: true, requiresData: true },
  { name: "Links", label: "Links", description: "Social and website links published by the business.", acceptsSchemas: SCHEMA_ROLES.business, ownerBound: true, requiresData: true },
  { name: "SocialProof", label: "Social proof", description: "Reviews and testimonials, labeled as published claims.", acceptsSchemas: SCHEMA_ROLES.business, ownerBound: true, requiresData: true },
  { name: "CTA", label: "Call to action", description: "Primary action block: visit website or start a conversation.", acceptsSchemas: [...SCHEMA_ROLES.business, ...SCHEMA_ROLES.service], ownerBound: true, requiresData: false },
  { name: "AskFYD", label: "Ask FYD", description: "Question box: ask anything about this business.", acceptsSchemas: SCHEMA_ROLES.business, ownerBound: true, requiresData: false },
  { name: "GenericObjectCard", label: "Generic object card", description: "Fallback renderer for schemas with no dedicated component.", acceptsSchemas: [], ownerBound: false, requiresData: true },
  {
    name: "ObjectRail",
    label: "Object rail",
    description: "Margin rail featuring one evidence-backed object through the ObjectCircle doorway (inline reference, hover preview, dialog); collapses to a drawer below the collapseBelow breakpoint. Geometry decides placement; center content is untouched.",
    acceptsSchemas: [...SCHEMA_ROLES.business, ...SCHEMA_ROLES.service, ...SCHEMA_ROLES.product, ...SCHEMA_ROLES.location, ...SCHEMA_ROLES.person, ...SCHEMA_ROLES.post, ...SCHEMA_ROLES.article, KNOWLEDGE_WEBSITE],
    ownerBound: false,
    requiresData: true,
    requiredData: ["objectPresence.objects", "themeTokens.breakpoints"],
    capabilities: ["preview"],
    responsive: { behavior: "rail-to-drawer", collapseBelow: "lg", touchTargetMinPx: 44 },
    editableProperties: ["heading", "objectPresence.mode", "objectPresence.rules.collapseBelow"],
    variants: ["rail", "drawer", "auto"],
  },
  {
    name: "Gallery",
    label: "Gallery",
    description: "Evidence-backed photo gallery from the site's acquired media (gallery/project/service/team/location roles). Renders only when gallery media exists; the section itself is the eligibility gate, so requiresData is false and the renderer returns null on empty media.",
    acceptsSchemas: [],
    ownerBound: true,
    requiresData: false,
    requiredData: ["renderContext.galleryMedia"],
    capabilities: ["preview"],
    responsive: { behavior: "stack", touchTargetMinPx: 44 },
    editableProperties: ["heading"],
    variants: ["grid"],
  },
];

const BY_NAME = new Map(DEFINITIONS.map((d) => [d.name, d]));

/**
 * DERIVED, single source of truth: invert the component -> schemas
 * mapping above into schema -> components (registry order). The
 * DEFINITIONS table is the only hand-written schema<->component
 * mapping; eligibleComponents() (sitespec/schemas.ts) is this same
 * inversion. The two directions cannot drift because only one of
 * them is written by hand. Computed once at module load.
 */
const COMPONENTS_BY_SCHEMA: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const d of DEFINITIONS) {
    for (const s of d.acceptsSchemas) {
      const list = m.get(s);
      if (list) list.push(d.name);
      else m.set(s, [d.name]);
    }
  }
  return m;
})();

/**
 * All components that can render an object of this schema, in registry
 * order. Unknown schemas resolve to ["GenericObjectCard"]: unknown
 * schemas render through the fallback, never fail. Never throws,
 * never returns empty.
 */
export function componentsForSchema(schemaId: string): string[] {
  return COMPONENTS_BY_SCHEMA.get(schemaId) ?? ["GenericObjectCard"];
}

export function getComponentDef(name: string): FYDComponentDef | undefined {
  return BY_NAME.get(name);
}

export function listComponentDefs(): FYDComponentDef[] {
  return DEFINITIONS.slice();
}

/**
 * Resolve the component for a schema: the first eligible dedicated
 * component in registry order, GenericObjectCard otherwise. This is the
 * head of componentsForSchema() with the generic fallback filtered out,
 * so it agrees with eligibleComponents() by construction. (The old
 * schemaRole() fallback was redundant: acceptance lists already carry the
 * knowledge-vocabulary ids through SCHEMA_ROLES.) Never throws, never
 * returns empty.
 */
export function componentForSchema(schemaId: string): string {
  const dedicated = componentsForSchema(schemaId).find(
    (n) => n !== "GenericObjectCard",
  );
  return dedicated ?? "GenericObjectCard";
}
