/**
 * Deterministic eligibility: which components may appear in a planned spec.
 *
 * The planner never invents sections; eligibility is the explicit, testable
 * statement of the data rules. The generator already emits sections only
 * when their data exists; the planner defensively filters its output
 * through this report so a future generator change cannot smuggle an
 * ungrounded section into a spec.
 *
 * Rules (all deterministic over the object graph):
 *  - service count > 0            -> Services eligible
 *  - product count > 0            -> Products eligible
 *  - location count > 0           -> Locations eligible
 *  - person + works_for (either direction to the owner) -> People ("team") eligible
 *  - external identity linked to the owner, or owner website field -> Links ("connected") eligible
 *  - posts + articles > 0         -> Posts / RecentObjects / ObjectFeed ("recent") eligible
 *  - owner has phone/email/website -> Contact eligible
 *  - owner present                -> Hero / BusinessSummary / AskFYD / CTA eligible
 *
 * Role membership mirrors the generator's ROLE_PREDICATES
 * (src/fyd/proceduralize/generator.ts): service/product via
 * provides|offers, location via located_at|has_location, person via
 * employs|has_member, post/article via publishes. Team eligibility
 * additionally honors the works_for predicate in either direction, which
 * is how website-ingested graphs record employment.
 */

import type { PingObject } from "@/lib/ping/types";
import { SCHEMA_ROLES, type FYDSchemaRole } from "../sitespec/schemas";
import { resolveWebsiteUrl } from "../sitespec/graph";
import type { ObjectGraph } from "../sitespec/types";

const ROLE_PREDICATES: Record<FYDSchemaRole, string[]> = {
  business: [],
  service: ["provides", "offers"],
  product: ["provides", "offers"],
  location: ["located_at", "has_location"],
  person: ["employs", "has_member"],
  post: ["publishes"],
  article: ["publishes"],
};

/** Schema id for external identities (no SCHEMA_ROLES entry; observed vocabulary). */
export const EXTERNAL_IDENTITY_SCHEMA = "ping.social.external_identity@1";

export interface EligibilityCounts {
  services: number;
  products: number;
  locations: number;
  team: number;
  connected: number;
  posts: number;
  articles: number;
  ownerPresent: boolean;
}

export interface EligibilityReport {
  counts: EligibilityCounts;
  /** Component name -> eligible. Only components the generator can emit are keys. */
  eligible: Record<string, boolean>;
  /** Component name -> human-readable reason for the eligibility decision. */
  reasons: Record<string, string>;
}

function relatedFrom(
  graph: ObjectGraph,
  ownerId: string,
  role: FYDSchemaRole,
): PingObject[] {
  const objects = new Map(graph.objects.map((o) => [o.id, o]));
  const predicates = ROLE_PREDICATES[role];
  const schemas = SCHEMA_ROLES[role];
  const out = new Map<string, PingObject>();
  for (const r of graph.relationships) {
    if (r.subject !== ownerId || r.status !== "active") continue;
    if (!predicates.includes(r.predicate)) continue;
    const target = objects.get(r.object);
    if (target && schemas.includes(target.schema) && target.visibility === "public") {
      out.set(target.id, target);
    }
  }
  return [...out.values()];
}

function ownerObject(graph: ObjectGraph): PingObject | null {
  const businesses = graph.objects
    .filter((o) => SCHEMA_ROLES.business.includes(o.schema) && o.visibility === "public")
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return businesses[0] ?? null;
}

function fieldValue(o: PingObject, name: string): string {
  const v = o.fields[name];
  return typeof v === "string" ? v : Array.isArray(v) ? v.join(",") : "";
}

export function deriveEligibility(graph: ObjectGraph): EligibilityReport {
  const owner = ownerObject(graph);
  const counts: EligibilityCounts = {
    services: 0,
    products: 0,
    locations: 0,
    team: 0,
    connected: 0,
    posts: 0,
    articles: 0,
    ownerPresent: owner !== null,
  };
  const eligible: Record<string, boolean> = {};
  const reasons: Record<string, string> = {};
  const set = (component: string, ok: boolean, reason: string) => {
    eligible[component] = ok;
    reasons[component] = reason;
  };

  if (!owner) {
    for (const c of [
      "Hero", "BusinessSummary", "Services", "Products", "Locations",
      "People", "Posts", "RecentObjects", "ObjectFeed", "Contact", "Links",
      "AskFYD", "CTA", "SocialProof",
    ]) {
      set(c, false, "no public business object: no owner, no site");
    }
    return { counts, eligible, reasons };
  }

  const ownerId = owner.id;
  counts.services = relatedFrom(graph, ownerId, "service").length;
  counts.products = relatedFrom(graph, ownerId, "product").length;
  counts.locations = relatedFrom(graph, ownerId, "location").length;
  const published = [...relatedFrom(graph, ownerId, "post"), ...relatedFrom(graph, ownerId, "article")];
  counts.posts = published.filter((o) => SCHEMA_ROLES.post.includes(o.schema)).length;
  counts.articles = published.filter((o) => SCHEMA_ROLES.article.includes(o.schema)).length;

  // Team: a person object joined to the owner by works_for in EITHER
  // direction (person works_for business, or business employs person).
  const personSchemas = SCHEMA_ROLES.person;
  const team = new Map<string, PingObject>();
  for (const r of graph.relationships) {
    if (r.status !== "active") continue;
    const forward =
      r.subject === ownerId && r.predicate === "employs";
    const backward =
      r.object === ownerId && r.predicate === "works_for";
    if (!forward && !backward) continue;
    const personId = forward ? r.object : r.subject;
    const person = graph.objects.find((o) => o.id === personId);
    if (person && personSchemas.includes(person.schema) && person.visibility === "public") {
      team.set(person.id, person);
    }
  }
  counts.team = team.size;

  // Connected: an external identity linked to the owner, or a website field.
  const objects = new Map(graph.objects.map((o) => [o.id, o]));
  let connected = 0;
  for (const r of graph.relationships) {
    if (r.status !== "active") continue;
    const involvesOwner =
      (r.subject === ownerId || r.object === ownerId) &&
      ["links_to", "has_identity", "same_as"].includes(r.predicate);
    if (!involvesOwner) continue;
    const otherId = r.subject === ownerId ? r.object : r.subject;
    const other = objects.get(otherId);
    if (other && other.schema === EXTERNAL_IDENTITY_SCHEMA && other.visibility === "public") {
      connected++;
    }
  }
  if (resolveWebsiteUrl(graph, ownerId) !== "") connected++;
  counts.connected = connected;

  const hasContact =
    fieldValue(owner, "phone") !== "" ||
    fieldValue(owner, "email") !== "" ||
    resolveWebsiteUrl(graph, ownerId) !== "";

  set("Hero", true, "owner present");
  set("BusinessSummary", owner.description.trim() !== "", owner.description.trim() !== "" ? "owner description present" : "owner description empty");
  set("Services", counts.services > 0, "service count " + counts.services + " > 0");
  set("Products", counts.products > 0, "product count " + counts.products + " > 0");
  set("Locations", counts.locations > 0, "location count " + counts.locations + " > 0");
  set("People", counts.team > 0, "team count " + counts.team + " (person + works_for)");
  set("Posts", counts.posts + counts.articles > 0, "published count " + (counts.posts + counts.articles) + " > 0");
  set("RecentObjects", counts.posts + counts.articles > 0, "published count " + (counts.posts + counts.articles) + " > 0");
  // ObjectFeed renders any feed-eligible content (posts, articles, services,
  // products): eligibility mirrors what the generator can actually emit so
  // the planner never filters a generator-emitted section.
  const feedable = counts.posts + counts.articles + counts.services + counts.products;
  set("ObjectFeed", feedable > 0, "feed-eligible count " + feedable + " > 0");
  set("Contact", hasContact, hasContact ? "phone/email/website present" : "no contact channels");
  set("Links", counts.connected > 0, "connected count " + counts.connected + " > 0");
  set("AskFYD", true, "site capability, always eligible with an owner");
  set("CTA", true, "site capability, always eligible with an owner");
  // The generator emits no SocialProof section today; eligibility stays
  // false so the planner can never invent one.
  set("SocialProof", false, "generator emits no SocialProof section: never invented");

  return { counts, eligible, reasons };
}
