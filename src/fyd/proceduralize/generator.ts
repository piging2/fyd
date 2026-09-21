/**
 * FYD site generator: ObjectGraph -> FYDSiteSpec. Pure and deterministic.
 *
 * Reasoning, in priority order:
 *  1. Find the owner: the public business object (lowest id wins ties).
 *  2. Gather groups by schema ROLE, not single schema id: the social
 *     vocabulary (ping.social.*, the proof vocabulary) and the knowledge
 *     vocabulary (ping.knowledge.*, the constitutional website-ingestion
 *     vocabulary) project onto the same roles. Services/products via
 *     provides/offers, locations via located_at/has_location, people via
 *     employs/has_member, posts/articles via publishes.
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
 * byte-identical specs. The only non-graph input is generatedAt, which is
 * passed in so tests can pin it.
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
import { SCHEMA_ROLES, type FYDSchemaRole } from "../sitespec/schemas";
import { resolveWebsiteUrl } from "../sitespec/graph";

export const GENERATOR_VERSION = "1.0.0";

export interface GeneratorOptions {
  generatedAt: string;
  /** Acceptance-sequence window of the ingestion events, when known. */
  eventSequences?: [number, number];
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

/**
 * Predicates that populate each role, in canonical order. The social path
 * uses provides/located_at/employs; the knowledge path uses
 * offers/located_at/employs. Both are matched; the first is the primary.
 */
const ROLE_PREDICATES: Record<FYDSchemaRole, string[]> = {
  business: [],
  service: ["provides", "offers"],
  product: ["provides", "offers"],
  location: ["located_at", "has_location"],
  person: ["employs", "has_member"],
  post: ["publishes"],
};

function group(graph: ObjectGraph): Grouped {
  const objects = new Map(graph.objects.map((o) => [o.id, o]));
  const businesses = graph.objects
    .filter((o) => SCHEMA_ROLES.business.includes(o.schema) && o.visibility === "public")
    .sort(byId);
  const owner = businesses[0] ?? null;

  const related = (role: FYDSchemaRole): PingObject[] => {
    if (!owner) return [];
    const out = new Map<string, PingObject>();
    const predicates = ROLE_PREDICATES[role];
    const schemas = SCHEMA_ROLES[role];
    for (const r of graph.relationships) {
      if (r.subject !== owner.id || r.status !== "active") continue;
      if (!predicates.includes(r.predicate)) continue;
      const target = objects.get(r.object);
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
  const published = related("post");
  const articles = published.filter((o) => o.schema === "ping.social.article@1");
  const posts = published.filter((o) => o.schema === "ping.social.post@1");

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

/** HOME: Hero, BusinessSummary, Services, Products, Locations, People, RecentObjects, Contact, Links, AskFYD. */
function homePage(g: Grouped, graph: ObjectGraph): FYDPage | null {
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
  if (g.articles.length > 0 || g.posts.length > 0) {
    add("RecentObjects", roleQuery(ownerId, "post", 6));
  }
  if (hasContact(graph, g.owner)) {
    add("Contact", { kind: "owner" });
  }
  if (hasSocials(graph, g.owner)) {
    add("Links", { kind: "owner" });
  }
  // AskFYD is a site capability, present on every generated home page.
  add("AskFYD", { kind: "static" });

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

/** EXPLORE: everything public, newest first. Exists when the graph is rich enough. */
function explorePage(g: Grouped, graph: ObjectGraph): FYDPage | null {
  const publicObjects = graph.objects.filter((o) => o.visibility === "public");
  if (publicObjects.length < 4) return null;
  return {
    slug: "explore",
    title: "Explore",
    navLabel: "Explore",
    sections: [
      section("explore", 0, "ObjectFeed", { kind: "all", limit: 20 }),
    ],
  };
}

export function generateSiteSpec(graph: ObjectGraph, opts: GeneratorOptions): FYDSiteSpec {
  const g = group(graph);
  const pages: FYDPage[] = [];
  const home = homePage(g, graph);
  const about = aboutPage(g);
  const services = servicesPage(g);
  const explore = explorePage(g, graph);
  if (home) pages.push(home);
  if (about) pages.push(about);
  if (services) pages.push(services);
  if (explore) pages.push(explore);

  return {
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
}
