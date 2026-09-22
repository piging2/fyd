/**
 * Shared fixtures for the builder (compiler core) tests.
 * Synthetic graphs only; no customer facts.
 */
import type { PingObject, PingRelationship } from "@/lib/ping/types";
import type { ObjectGraph } from "../../sitespec/types";

const TS = "2026-09-21T00:00:00.000Z";

export function makeObject(
  id: string,
  schema: string,
  opts?: Partial<PingObject>,
): PingObject {
  return {
    id,
    schema,
    controllerId: "test-controller",
    visibility: "public",
    title: id,
    description: "",
    fields: {},
    createdAt: TS,
    updatedAt: TS,
    provenance: {
      kind: "website-derived",
      ref: "website-ingestion:https://example.com/",
      derivedAt: TS,
    },
    ...(opts ?? {}),
  };
}

export function makeRelationship(
  id: string,
  subject: string,
  predicate: string,
  object: string,
): PingRelationship {
  return {
    id,
    subject,
    predicate,
    object,
    status: "active",
    createdAt: TS,
    evidenceRef: "website-ingestion:https://example.com/",
  };
}

const BIZ = "ping.social.business@1";
const SVC = "ping.social.service@1";
const LOC = "ping.social.location@1";
const PERSON = "ping.social.person@1";
const POST = "ping.social.post@1";
const ARTICLE = "ping.social.article@1";
const EXT = "ping.social.external_identity@1";

/** A local trade graph: owner + services + location + team + links + a post. */
export function tradeGraph(): ObjectGraph {
  const owner = makeObject("biz-trade", BIZ, {
    title: "Acme Plumbing",
    description: "Full-service plumbing for the valley.",
    fields: {
      phone: "555-0100",
      website: "https://acme-plumbing.example.com/",
      locality: "Grand Junction, Colorado",
    },
  });
  const objects = [
    owner,
    makeObject("svc-drains", SVC, { title: "Drain cleaning", description: "Clear slow drains fast." }),
    makeObject("svc-heaters", SVC, { title: "Water heaters", description: "Install and repair." }),
    makeObject("loc-gj", LOC, { title: "Grand Junction", fields: { locality: "Grand Junction" } }),
    makeObject("person-jo", PERSON, { title: "Jo Rivera", fields: { name: "Jo Rivera" } }),
    makeObject("ext-fb", EXT, {
      title: "Acme on Facebook",
      fields: { url: "https://facebook.example.com/acme", platform: "facebook" },
    }),
    makeObject("post-1", POST, { title: "Winterizing tips", description: "How to winterize." }),
  ];
  const relationships = [
    makeRelationship("rel-1", "biz-trade", "provides", "svc-drains"),
    makeRelationship("rel-2", "biz-trade", "provides", "svc-heaters"),
    makeRelationship("rel-3", "biz-trade", "located_at", "loc-gj"),
    makeRelationship("rel-4", "person-jo", "works_for", "biz-trade"),
    makeRelationship("rel-5", "biz-trade", "links_to", "ext-fb"),
    makeRelationship("rel-6", "biz-trade", "publishes", "post-1"),
  ];
  return { objects, relationships };
}

/** A knowledge/consultancy graph: owner + services + articles, no team. */
export function knowledgeGraph(): ObjectGraph {
  const owner = makeObject("biz-know", BIZ, {
    title: "Acme Automation Consulting",
    description: "Practical automation for local businesses.",
    fields: { phone: "555-0200", locality: "Grand Junction, Colorado" },
  });
  const objects = [
    owner,
    makeObject("svc-a", SVC, { title: "Call answering", description: "Never miss a call." }),
    makeObject("svc-b", SVC, { title: "Follow-up automation", description: "Chase every lead." }),
    makeObject("svc-c", SVC, { title: "Workflow audits", description: "Find the waste." }),
    makeObject("loc-gj", LOC, { title: "Grand Junction", fields: { locality: "Grand Junction" } }),
    makeObject("ext-fb", EXT, {
      title: "Acme on Facebook",
      fields: { url: "https://facebook.example.com/acme2", platform: "facebook" },
    }),
    makeObject("art-1", ARTICLE, { title: "The missed-call math", description: "An essay." }),
    makeObject("art-2", ARTICLE, { title: "Follow-up playbooks", description: "Another essay." }),
  ];
  const relationships = [
    makeRelationship("rel-1", "biz-know", "provides", "svc-a"),
    makeRelationship("rel-2", "biz-know", "provides", "svc-b"),
    makeRelationship("rel-3", "biz-know", "provides", "svc-c"),
    makeRelationship("rel-4", "biz-know", "located_at", "loc-gj"),
    makeRelationship("rel-5", "biz-know", "links_to", "ext-fb"),
    makeRelationship("rel-6", "biz-know", "publishes", "art-1"),
    makeRelationship("rel-7", "biz-know", "publishes", "art-2"),
  ];
  return { objects, relationships };
}
