/**
 * FYD site generator: ObjectGraph -> FYDSiteSpec. Pure and deterministic.
 *
 * Reasoning, in priority order:
 *  1. Find the owner: the public business object (lowest id wins ties).
 *  2. Gather groups by schema ROLE, not single schema id: the social
 *     vocabulary (ping.social.*, the proof vocabulary) and the knowledge
 *     vocabulary (ping.knowledge.*, the constitutional website-ingestion
 *     vocabulary) project onto the same roles. Services/products via
 *     provides/offers/provided_by, locations via located_at/has_location,
 *     people via employs/works_for (matched in either direction),
 *     posts/articles via publishes/published_by.
 *  3. Emit pages in fixed order (home, about, services, explore), but a
 *     page exists only when its data exists. Missing data means the page
 *     or section does not exist; nothing is invented.
 *  4. Emit sections in fixed order per page. Section ids are
 *     pageSlug:component:index. Every sort is by id, never by database or
 *     insertion order. Section queries carry the full predicate/schema
 *     match set for the role, so one spec compiles either vocabulary.
 *  5. Zero company-specific hand-layout: the generator never mentions
 *     Happy Place. Any business graph compiles through the same rules.
 *
 * Determinism: same graph (same object ids, fields, relationships) yields
 * byte-identical specs. The non-graph inputs are generatedAt, which is
 * passed in so tests can pin it, and the optional siteId. When siteId is
 * provided, the media-manifest read behind Gallery emission is the same
 * deterministic disk input the render seam uses (no network, no mutation),
 * so same graph + same manifest yields the same spec. Without siteId the
 * generator never consults media state and output is byte-identical to the
 * pure-graph compile.
 */

import type { PingObject } from "@/lib/ping/types";
import {
  DEFAULT_FYD_THEME,
  type FYDPage,
  type FYDQuery,
  type FYDSection,
  type FYDSiteSpec,
  type ObjectGraph,
} from "../sitespec/types";
import {
  SCHEMA_ROLES,
  ROLE_PREDICATES,
  ownerRelationshipTarget,
  eligibleComponents,
  type FYDSchemaRole,
} from "../sitespec/schemas";
import { resolveWebsiteUrl } from "../sitespec/graph";
import { applyArchetype } from "../archetypes/apply";
import type { ArchetypeProfile } from "../archetypes/profiles";
import { galleryMediaFor } from "../media/select";

export const GENERATOR_VERSION = "1.1.0";

export interface GeneratorOptions {
  generatedAt: string;
  /** Acceptance-sequence window of the ingestion events, when known. */
  eventSequences?: [number, number];
  /**
   * Site id for media-backed section emission. Optional: absent, the
   * generator never consults the media manifest and output is
   * byte-identical to the pure-graph compile. Present, the generator
   * emits a Gallery section if and only if the site has >=1 acquired
   * gallery asset (galleryMediaFor: logos, heroes, and thumbnails are
   * excluded). The manifest lookup is keyed by site id only: no
   * customer-specific branching anywhere in the generator.
   */
  siteId?: string;
  /**
   * Optional archetype profile for composition. Absent: today output,
   * byte-identical. Present: applyArchetype composes the spec
   * deterministically (archetype, theme, section order, objectPresence).
   */
  profile?: ArchetypeProfile;
}

interface Grouped {
  owner: PingObject | null;
  services: PingObject[];
  products: PingObject[];
  locations: PingObject[];
  people: PingObject[];
  articles: PingObject[];
  posts: PingObject[];
}

const byId = (a: PingObject, b: PingObject) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function group(graph: ObjectGraph): Grouped {
  const objects = new Map(graph.objects.map((o) => [o.id, o]));
  const businesses = graph.objects
    .filter((o) => SCHEMA_ROLES.business.includes(o.schema) && o.visibility === "public")
    .sort(byId);
  const owner = businesses[0] ?? null;

  // Direction-agnostic role membership: a member is whichever endpoint of
  // an active relationship is not the owner, for any predicate in the
  // role's vocabulary (employs or works_for, provides or provided_by,
  // publishes or published_by). Website-ingested graphs record employment
  // as person works_for business; matching only the owner-subject direction
  // silently deleted the team from composition.
  const related = (role: FYDSchemaRole): PingObject[] => {
    if (!owner) return [];
    const out = new Map<string, PingObject>();
    const predicates = ROLE_PREDICATES[role];
    const schemas = SCHEMA_ROLES[role];
    for (const r of graph.relationships) {
      if (!predicates.includes(r.predicate)) continue;
      const memberId = ownerRelationshipTarget(r, owner.id);
      if (memberId === null) continue;
      const target = objects.get(memberId);
      if (target && schemas.includes(target.schema) && target.visibility === "public") {
        out.set(target.id, target);
      }
    }
    return [...out.values()].sort(byId);
  };

  const services = related("service");
  const products = related("product");
  const locations = related("location");
  const people = related("person");
  // Published content spans the post and article roles; the split reads
  // the central role map, never hardcoded schema ids.
  const published = [...related("post"), ...related("article")].sort(byId);
  const articles = published.filter((o) => SCHEMA_ROLES.article.includes(o.schema));
  const posts = published.filter((o) => SCHEMA_ROLES.post.includes(o.schema));

  return { owner, services, products, locations, people, articles, posts };
}

function section(
  pageSlug: string,
  index: number,
  component: string,
  query: FYDSection["query"],
  presentation: FYDSection["presentation"] = {},
): FYDSection {
  return {
    id: pageSlug + ":" + component + ":" + index,
    component,
    query,
    presentation,
  };
}

/** A section query matching every predicate/schema of several roles, in canonical order. */
function roleQueryUnion(from: string, roles: FYDSchemaRole[], limit?: number): FYDQuery {
  const predicates = [...new Set(roles.flatMap((r) => ROLE_PREDICATES[r]))];
  return {
    kind: "related",
    from,
    predicate: predicates[0],
    predicates,
    schemas: roles.flatMap((r) => SCHEMA_ROLES[r]),
    limit,
  };
}

/** A section query matching every predicate/schema of a role, in canonical order. */
function roleQuery(from: string, role: FYDSchemaRole, limit?: number): FYDQuery {
  const predicates = ROLE_PREDICATES[role];
  return {
    kind: "related",
    from,
    predicate: predicates[0],
    predicates,
    schemas: SCHEMA_ROLES[role],
    limit,
  };
}

/** HOME: Hero, BusinessSummary, Services, Products, Locations, People, Gallery, RecentObjects, Contact, Links, CTA, AskFYD, ObjectRail. */
function homePage(g: Grouped, graph: ObjectGraph, opts: GeneratorOptions): FYDPage | null {
  if (!g.owner) return null;
  const ownerId = g.owner.id;
  const sections: FYDSection[] = [];
  const add = (component: string, query: FYDSection["query"]) => {
    sections.push(section("home", sections.length, component, query));
  };

  add("Hero", { kind: "owner" });
  if (g.owner.description.trim() !== "") {
    add("BusinessSummary", { kind: "owner" });
  }
  if (g.services.length > 0) {
    add("Services", roleQuery(ownerId, "service"));
  }
  if (g.products.length > 0) {
    add("Products", roleQuery(ownerId, "product"));
  }
  if (g.locations.length > 0) {
    add("Locations", roleQuery(ownerId, "location"));
  }
  if (g.people.length > 0) {
    add("People", roleQuery(ownerId, "person"));
  }
  // Gallery: emitted if and only if the site carries >=1 acquired gallery
  // asset. The manifest is keyed by site id; an absent siteId means no
  // lookup, no Gallery, byte-identical output. The Gallery section renders
  // nothing on empty media, but the generator never emits an empty gallery:
  // the section exists exactly when its data exists. Query kind "static":
  // the section resolves no graph objects (its media arrives via the render
  // context, like heroMedia), mirroring AskFYD.
  if (opts.siteId && galleryMediaFor(opts.siteId, graph, ownerId).length > 0) {
    add("Gallery", { kind: "static" });
  }
  if (g.articles.length > 0 || g.posts.length > 0) {
    add("RecentObjects", roleQueryUnion(ownerId, ["post", "article"], 6));
  }
  if (hasContact(graph, g.owner)) {
    add("Contact", { kind: "owner" });
  }
  if (hasSocials(graph, g.owner)) {
    add("Links", { kind: "owner" });
  }
  // CTA is a site capability, present on every generated home page: the
  // visitor's primary action block (visit website / ask FYD). The registry,
  // the renderer, the eligibility report, and the dimension-vector policy
  // (CTA boosted by urgency) all already account for it; the generator
  // simply never emitted it.
  add("CTA", { kind: "owner" });
  // AskFYD is a site capability, present on every generated home page.
  add("AskFYD", { kind: "static" });
  // ObjectRail: the primary-circle doorway, inline. Features the richest
  // related object (service, product, person, post, article) through the
  // existing ObjectCircle doorway. Emitted only when the owner has related
  // objects to feature; the planner's density policy still caps sections.
  const featureable =
    g.services.length +
    g.products.length +
    g.people.length +
    g.articles.length +
    g.posts.length;
  if (featureable > 0) {
    add(
      "ObjectRail",
      roleQueryUnion(ownerId, ["service", "product", "person", "post", "article"], 6),
    );
  }

  return { slug: "home", title: g.owner.title, navLabel: "Home", sections };
}

function fieldValue(o: PingObject, name: string): string {
  const v = o.fields[name];
  return typeof v === "string" ? v : Array.isArray(v) ? v.join(",") : "";
}

function hasContact(graph: ObjectGraph, owner: PingObject): boolean {
  return (
    fieldValue(owner, "phone") !== "" ||
    fieldValue(owner, "email") !== "" ||
    resolveWebsiteUrl(graph, owner.id) !== ""
  );
}

function hasSocials(graph: ObjectGraph, owner: PingObject): boolean {
  return fieldValue(owner, "socials") !== "" || resolveWebsiteUrl(graph, owner.id) !== "";
}

/** ABOUT: BusinessSummary plus People. Exists when there is something to say. */
function aboutPage(g: Grouped): FYDPage | null {
  if (!g.owner) return null;
  const ownerId = g.owner.id;
  const sections: FYDSection[] = [];
  const add = (component: string, query: FYDSection["query"]) => {
    sections.push(section("about", sections.length, component, query));
  };
  if (g.owner.description.trim() !== "") {
    add("BusinessSummary", { kind: "owner" });
  }
  if (g.people.length > 0) {
    add("People", roleQuery(ownerId, "person"));
  }
  if (sections.length === 0) return null;
  return { slug: "about", title: "About " + g.owner.title, navLabel: "About", sections };
}

/** SERVICES: the full service list. Exists only when services exist. */
function servicesPage(g: Grouped): FYDPage | null {
  if (!g.owner || g.services.length === 0) return null;
  return {
    slug: "services",
    title: "Services",
    navLabel: "Services",
    sections: [section("services", 0, "Services", roleQuery(g.owner.id, "service"))],
  };
}

/** EXPLORE: the feed-renderable public objects, newest first. Exists
 * when the graph is rich enough AND at least one public schema is
 * feed-renderable. The planner asks eligibleComponents() (the registry
 * contract): sections exist when their data exists, so no feed-renderable
 * schema means no Explore page. */
function explorePage(g: Grouped, graph: ObjectGraph): FYDPage | null {
  const publicObjects = graph.objects.filter((o) => o.visibility === "public");
  if (publicObjects.length < 4) return null;
  const feedSchemas = [...new Set(publicObjects.map((o) => o.schema))]
    .filter((s) => eligibleComponents(s).includes("ObjectFeed"))
    .sort();
  if (feedSchemas.length === 0) return null;
  return {
    slug: "explore",
    title: "Explore",
    navLabel: "Explore",
    sections: [
      section("explore", 0, "ObjectFeed", { kind: "all", schemas: feedSchemas, limit: 20 }),
    ],
  };
}

export function generateSiteSpec(graph: ObjectGraph, opts: GeneratorOptions): FYDSiteSpec {
  const g = group(graph);
  const pages: FYDPage[] = [];
  const home = homePage(g, graph, opts);
  const about = aboutPage(g);
  const services = servicesPage(g);
  const explore = explorePage(g, graph);
  if (home) pages.push(home);
  if (about) pages.push(about);
  if (services) pages.push(services);
  if (explore) pages.push(explore);

  const spec: FYDSiteSpec = {
    kind: "fyd.sitespec@1",
    ownerObjectId: g.owner ? g.owner.id : "",
    version: 1,
    generator: {
      name: "fyd-site-generator",
      version: GENERATOR_VERSION,
      generatedAt: opts.generatedAt,
    },
    themeTokens: { ...DEFAULT_FYD_THEME },
    navigation: pages.map((p) => ({ label: p.navLabel, pageSlug: p.slug })),
    pages,
    provenance: {
      source: "website-ingestion",
      claimKind: "website_statement",
      eventSequences: opts.eventSequences,
      note: "Generated from website-ingestion graph objects. All claims are website_statement, not verified fact.",
    },
  };
  // Optional archetype composition: an absent profile leaves today output
  // byte-identical; a present profile composes deterministically.
  return opts.profile ? applyArchetype(spec, opts.profile, graph) : spec;
}
