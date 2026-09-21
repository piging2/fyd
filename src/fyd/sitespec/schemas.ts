/**
 * FYD proof schemas: exactly three (Business, Service, Post).
 *
 * One schema definition drives five things (harvest T4 codegen chain):
 *   SCHEMA -> VALIDATOR -> OBJECT eligibility -> RELATIONSHIPS ->
 *   CAPABILITIES -> RENDERER props -> AGENT TOOL description.
 *
 * Evolution law (harvest T5): new fields are optional, never change a
 * field type, never remove a field. Breaking changes mint a new version.
 */

import type { FYDFinding } from "./types";

export type FYDFieldType = "string" | "string[]" | "url";

export interface FYDSchemaField {
  name: string;
  type: FYDFieldType;
  required: boolean;
  label: string;
  /** Short plain-language meaning, used in agent tool descriptions. */
  meaning: string;
}

export interface FYDRelationshipRule {
  predicate: string;
  targetSchemas: string[];
  meaning: string;
}

export interface FYDSchemaDef {
  id: string;
  label: string;
  /** Plain-language summary for the agent tool description. */
  summary: string;
  fields: FYDSchemaField[];
  relationships: FYDRelationshipRule[];
  /** True when the object is backed by an identity a viewer can follow. */
  identityBacked: boolean;
  /** True when likes belong on this schema (content, never identities). */
  likeable: boolean;
}

export const BUSINESS_SCHEMA: FYDSchemaDef = {
  id: "ping.social.business@1",
  label: "Business",
  summary:
    "A business: name, description, category, website, contact details, hours, and social links. The root object a generated site is built around.",
  fields: [
    { name: "title", type: "string", required: true, label: "Name", meaning: "The business name." },
    { name: "description", type: "string", required: true, label: "Description", meaning: "What the business does, in its own words." },
    { name: "category", type: "string", required: false, label: "Category", meaning: "Trade or industry category." },
    { name: "website", type: "url", required: false, label: "Website", meaning: "Public website URL." },
    { name: "phone", type: "string", required: false, label: "Phone", meaning: "Public business phone." },
    { name: "email", type: "string", required: false, label: "Email", meaning: "Public business email." },
    { name: "hours", type: "string", required: false, label: "Hours", meaning: "Opening hours as published." },
    { name: "socials", type: "string[]", required: false, label: "Social links", meaning: "Public social profile URLs." },
  ],
  relationships: [
    { predicate: "provides", targetSchemas: ["ping.social.service@1", "ping.social.product@1"], meaning: "Services or products the business offers." },
    { predicate: "publishes", targetSchemas: ["ping.social.post@1", "ping.social.article@1"], meaning: "Posts or articles the business published." },
    { predicate: "located_at", targetSchemas: ["ping.social.location@1"], meaning: "Where the business operates." },
    { predicate: "employs", targetSchemas: ["ping.social.person@1"], meaning: "People behind the business." },
  ],
  identityBacked: true,
  likeable: false,
};

export const SERVICE_SCHEMA: FYDSchemaDef = {
  id: "ping.social.service@1",
  label: "Service",
  summary:
    "A service the business offers: name, description, and optional price or duration hints. Rendered as cards in Services sections.",
  fields: [
    { name: "title", type: "string", required: true, label: "Name", meaning: "The service name." },
    { name: "description", type: "string", required: true, label: "Description", meaning: "What the service includes." },
    { name: "price_hint", type: "string", required: false, label: "Price hint", meaning: "Published price guidance, never a quote." },
    { name: "duration", type: "string", required: false, label: "Duration", meaning: "Typical job duration as published." },
  ],
  relationships: [
    { predicate: "provided_by", targetSchemas: ["ping.social.business@1"], meaning: "The business offering this service." },
  ],
  identityBacked: false,
  likeable: true,
};

export const POST_SCHEMA: FYDSchemaDef = {
  id: "ping.social.post@1",
  label: "Post",
  summary:
    "A post or article: title, body text, publish date, and tags. Rendered in feeds and recent-objects sections. Replies reference posts.",
  fields: [
    { name: "title", type: "string", required: true, label: "Title", meaning: "The post title." },
    { name: "text", type: "string", required: false, label: "Body", meaning: "The post body text." },
    { name: "date", type: "string", required: false, label: "Date", meaning: "Publish date as published." },
    { name: "tags", type: "string[]", required: false, label: "Tags", meaning: "Topic tags." },
    { name: "url", type: "url", required: false, label: "Link", meaning: "Canonical link to the full post." },
  ],
  relationships: [
    { predicate: "published_by", targetSchemas: ["ping.social.business@1"], meaning: "The business that published this post." },
    { predicate: "replies_to", targetSchemas: ["ping.social.post@1"], meaning: "The post this replies to." },
  ],
  identityBacked: false,
  likeable: true,
};

/** The three proof schemas. Not one hundred. */
export const FYD_SCHEMAS: FYDSchemaDef[] = [BUSINESS_SCHEMA, SERVICE_SCHEMA, POST_SCHEMA];

export function getSchemaDef(schemaId: string): FYDSchemaDef | undefined {
  return FYD_SCHEMAS.find((s) => s.id === schemaId);
}

// ---------------------------------------------------------------------------
// Schema roles: the site compiler reasons over roles, not single schema ids.
//
// The ping.social.* vocabulary above is the proof vocabulary: three
// definitions driving everything. The ping.knowledge.* vocabulary is the
// constitutional website-ingestion vocabulary (knowledge adapter, no new
// authority): knowledge objects project onto the same site-compiler roles.
// This mapping is a projection, not a second set of definitions; nothing
// here mints a schema, and the proof stays exactly Business, Service, Post.
// ---------------------------------------------------------------------------

export type FYDSchemaRole = "business" | "service" | "product" | "location" | "person" | "post";

export const SCHEMA_ROLES: Record<FYDSchemaRole, string[]> = {
  business: ["ping.social.business@1", "ping.knowledge.business@1"],
  service: ["ping.social.service@1", "ping.knowledge.service@1"],
  product: ["ping.social.product@1"],
  location: ["ping.social.location@1", "ping.knowledge.location@1"],
  person: ["ping.social.person@1", "ping.knowledge.person@1"],
  post: ["ping.social.post@1", "ping.social.article@1"],
};

/** The site-compiler role a schema id plays, or null when it plays none. */
export function schemaRole(schemaId: string): FYDSchemaRole | null {
  const roles = Object.keys(SCHEMA_ROLES) as FYDSchemaRole[];
  for (const role of roles) {
    if (SCHEMA_ROLES[role].includes(schemaId)) return role;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Derivation 1: VALIDATOR. Schema -> findings over a field record.
// ---------------------------------------------------------------------------

export interface FieldRecord {
  title: string;
  description: string;
  fields: Record<string, string | string[]>;
}

/**
 * Validate an object's scalar fields against its schema definition.
 * Returns findings (harvest B6 shape); empty means valid.
 */
export function validateAgainstSchema(
  def: FYDSchemaDef,
  record: FieldRecord,
  resourceId: string,
): FYDFinding[] {
  const findings: FYDFinding[] = [];
  const at = (path: string) => "object." + path;
  for (const f of def.fields) {
    const raw =
      f.name === "title"
        ? record.title
        : f.name === "description"
          ? record.description
          : record.fields[f.name];
    if (raw === undefined || raw === null || raw === "") {
      if (f.required) {
        findings.push({
          severity: "error",
          authority: "fyd.sitespec.validator",
          resourceId,
          path: at(f.name),
          message: "Required field '" + f.name + "' is missing.",
        });
      }
      continue;
    }
    const ok =
      f.type === "string"
        ? typeof raw === "string"
        : f.type === "string[]"
          ? Array.isArray(raw) && raw.every((e) => typeof e === "string")
          : typeof raw === "string";
    if (!ok) {
      findings.push({
        severity: "error",
        authority: "fyd.sitespec.validator",
        resourceId,
        path: at(f.name),
        message:
          "Field '" + f.name + "' must be " + f.type + " (schema evolution law: types never change).",
      });
    }
    if (f.type === "url" && typeof raw === "string" && !/^https?:\/\//.test(raw) && !raw.startsWith("/")) {
      findings.push({
        severity: "warning",
        authority: "fyd.sitespec.validator",
        resourceId,
        path: at(f.name),
        message: "Field '" + f.name + "' does not look like a URL: '" + raw.slice(0, 60) + "'.",
      });
    }
  }
  // Unknown fields are tolerated (harvest T5), reported as info.
  const known = new Set(def.fields.map((f) => f.name));
  for (const key of Object.keys(record.fields)) {
    if (!known.has(key)) {
      findings.push({
        severity: "info",
        authority: "fyd.sitespec.validator",
        resourceId,
        path: at("fields." + key),
        message: "Unknown field '" + key + "' tolerated and passed through.",
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Derivation 2: COMPONENT ELIGIBILITY. Schema -> component names.
// (The registry itself owns the mapping; this is the schema-side view used
// by the generator to ask "which components may render this schema?")
// ---------------------------------------------------------------------------

/** Component names eligible for each schema. Unknown schemas get GenericObjectCard. */
const SCHEMA_COMPONENTS: Record<string, string[]> = {
  "ping.social.business@1": [
    "Hero",
    "IdentityCard",
    "BusinessSummary",
    "Contact",
    "CTA",
    "Links",
    "SocialProof",
    "AskFYD",
    "ObjectGrid",
    "ObjectFeed",
  ],
  "ping.social.service@1": ["Services", "ObjectGrid", "ObjectFeed", "CTA"],
  "ping.social.post@1": ["Posts", "ObjectGrid", "ObjectFeed", "RecentObjects"],
  "ping.social.product@1": ["Products", "ObjectGrid", "ObjectFeed"],
  "ping.social.location@1": ["Locations", "ObjectGrid", "ObjectFeed"],
  "ping.social.person@1": ["People", "ObjectGrid", "ObjectFeed"],
  "ping.social.article@1": ["Posts", "ObjectGrid", "ObjectFeed", "RecentObjects"],
  // Knowledge vocabulary: the website object is a public object like any
  // other; the generic list components may render it. Role-projected
  // schemas (business/service/location/person) resolve through schemaRole()
  // in eligibleComponents below and need no entries here.
  "ping.knowledge.website@1": ["ObjectGrid", "ObjectFeed"],
};

export function eligibleComponents(schemaId: string): string[] {
  const direct = SCHEMA_COMPONENTS[schemaId];
  if (direct) return direct;
  // Knowledge vocabulary projects onto the proof vocabulary's roles, so a
  // knowledge service is eligible for exactly the service components.
  const role = schemaRole(schemaId);
  if (role) {
    const proofId = SCHEMA_ROLES[role][0];
    const viaRole = SCHEMA_COMPONENTS[proofId];
    if (viaRole) return viaRole;
  }
  return ["GenericObjectCard"];
}

// ---------------------------------------------------------------------------
// Derivation 3: RELATIONSHIP RULES. Schema -> allowed predicates.
// ---------------------------------------------------------------------------

export function relationshipRules(schemaId: string): FYDRelationshipRule[] {
  return getSchemaDef(schemaId)?.relationships ?? [];
}

export function isAllowedPredicate(schemaId: string, predicate: string): boolean {
  return relationshipRules(schemaId).some((r) => r.predicate === predicate);
}

// ---------------------------------------------------------------------------
// Derivation 4: CAPABILITY OPTIONS. Schema -> action kinds.
// Mirrors the action-planner rules (harvest B3): open/ask/reference always,
// follow only identity-backed, like only content, reply on posts for
// signed-in viewers, propose_update only when the viewer controls the
// object, open_website only with a public URL.
// ---------------------------------------------------------------------------

export type FYDActionKind =
  | "open"
  | "ask"
  | "reference"
  | "follow"
  | "like"
  | "reply"
  | "propose_update"
  | "open_website"
  | "site_propose";

export interface CapabilityInput {
  viewerId: string | null;
  controllerId: string;
  hasWebsite: boolean;
}

export function capabilityOptions(def: FYDSchemaDef, input: CapabilityInput): FYDActionKind[] {
  const actions: FYDActionKind[] = ["open", "ask", "reference"];
  if (def.identityBacked) {
    actions.push("follow");
  }
  if (def.likeable) {
    actions.push("like");
  }
  if (def.id === "ping.social.post@1" && input.viewerId) {
    actions.push("reply");
  }
  if (input.viewerId && input.viewerId === input.controllerId) {
    actions.push("propose_update");
    actions.push("site_propose");
  }
  if (input.hasWebsite) {
    actions.push("open_website");
  }
  return actions;
}

// ---------------------------------------------------------------------------
// Derivation 5: AGENT TOOL DESCRIPTION. Schema -> tool description text.
// Cacheable, deterministic, derived from the single schema definition.
// ---------------------------------------------------------------------------

export function agentToolDescription(def: FYDSchemaDef): string {
  const lines: string[] = [];
  lines.push("Object type " + def.id + " (" + def.label + ").");
  lines.push(def.summary);
  lines.push("Fields:");
  for (const f of def.fields) {
    lines.push(
      "  - " + f.name + " (" + f.type + (f.required ? ", required" : ", optional") + "): " + f.meaning,
    );
  }
  if (def.relationships.length > 0) {
    lines.push("Relationships:");
    for (const r of def.relationships) {
      lines.push("  - " + r.predicate + " -> " + r.targetSchemas.join(", ") + ": " + r.meaning);
    }
  }
  lines.push("Capabilities: " + capabilityOptions(def, { viewerId: null, controllerId: "", hasWebsite: false }).join(", ") + " (viewer-dependent options expand at plan time).");
  return lines.join("\n");
}
