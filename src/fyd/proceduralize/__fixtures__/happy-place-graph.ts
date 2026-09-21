/**
 * Happy Place graph fixture: derived from the canonical PING event journal,
 * acceptance sequences 65-83 (lane B website-ingestion run, 2026-09-21,
 * Ed25519-signed at emission via the governed POST /events path).
 *
 * 9 objects, 10 relationships. Object ids, relationship ids, schema names,
 * predicates, and field values are copied from the accepted event bodies
 * (~/workspace/lane-b/bodies.json); only the PingObject/PingRelationship
 * projection shape is this lane's. Every claim is labeled website_statement:
 * claimed by the website, never verified fact. No precise personal addresses
 * appear anywhere: the location is a coarse service area and the people are
 * site personas, exactly as the canonical events record them.
 */

import type { PingObject, PingRelationship } from "@/lib/ping/types";
import type { ObjectGraph } from "../../sitespec/types";

const OBSERVED_AT = "2026-09-21T02:44:00Z";
const SOURCE = "https://happy-place-platform.vercel.app/";
const CONTROLLER = "identity_cc3383c868f96fc1";
const EVIDENCE_REF = "lane-b-observation-001";

function provenance() {
  return {
    kind: "website-derived" as const,
    ref: "website-ingestion:seq65-83:" + EVIDENCE_REF,
    derivedAt: OBSERVED_AT,
  };
}

function claimFields(extra: Record<string, string | string[]>): Record<string, string | string[]> {
  return {
    claimKind: "website_statement",
    source_url: SOURCE,
    source_type: "website_text_extraction",
    observed_at: OBSERVED_AT,
    ...extra,
  };
}

function obj(
  id: string,
  schema: string,
  title: string,
  description: string,
  fields: Record<string, string | string[]>,
): PingObject {
  return {
    id,
    schema,
    controllerId: CONTROLLER,
    visibility: "public",
    title,
    description,
    fields: claimFields(fields),
    createdAt: OBSERVED_AT,
    updatedAt: OBSERVED_AT,
    provenance: provenance(),
  };
}

const objects: PingObject[] = [
  obj(
    "object_6cc955e4077ad14f",
    "ping.knowledge.business@1",
    "Happy Place Carpentry",
    "We repair, restore, and improve homes across the Mid-Willamette Valley. The work should look right the day we leave, and still look right years later.",
    {
      tagline: "Your favorite part of coming home should be the home itself.",
      claimed_projects_completed: "125+",
      claimed_license: "CCB# 254240",
      claimed_licensed: "true",
      claimed_bonded: "true",
      claimed_insured: "true",
      price_range: "$$",
      phone: "+15412865190",
    },
  ),
  obj(
    "object_cda465c087b62af9",
    "ping.knowledge.website@1",
    "Happy Place Carpentry \u2014 Decks, Fences & Remodels in the Willamette Valley",
    "Website sections observed: hero; services (A few ways we can help); Recent Work; about/family business; reviews; newsletter; contact. 2 images.",
    {
      url: SOURCE,
      page_sections: [
        "hero",
        "services (A few ways we can help)",
        "Recent Work",
        "about/family business",
        "reviews",
        "newsletter",
        "contact",
      ],
      image_count: "2",
    },
  ),
  obj(
    "object_f4be50f223741f51",
    "ping.knowledge.location@1",
    "Mid-Willamette Valley",
    "Service area as claimed by the site; not a street address. No precise personal addresses are recorded.",
    {
      kind: "service_area",
      counties: ["Benton", "Linn", "Marion", "Polk"],
      state: "Oregon",
      state_basis: "extractor_inference: Oregon CCB license claim + Willamette Valley geography",
    },
  ),
  obj("object_fdce5190ab155923", "ping.knowledge.service@1", "Decks", "", {}),
  obj("object_587e260b409b2de9", "ping.knowledge.service@1", "Fences", "", {}),
  obj("object_50fec066de21d77b", "ping.knowledge.service@1", "Remodels", "", {}),
  obj(
    "object_daa1ea29cd83240b",
    "ping.knowledge.service@1",
    "Home repair and restoration",
    "",
    {},
  ),
  obj(
    "object_5b5b3d32bca8145b",
    "ping.knowledge.person@1",
    "Taylor Happy",
    "Taylor cares about the work you'll notice five years from now, not just on the day it passes inspection.",
    {
      role: "owner",
      persona_note: "Persona presented on the portfolio demo site; not a verified real person.",
    },
  ),
  obj(
    "object_9f01b2dede1da5d0",
    "ping.knowledge.person@1",
    "Lanie Happy",
    "Lanie keeps every project organized so you always know what's happening, what's next, and who to call.",
    {
      role: "owner",
      persona_note: "Persona presented on the portfolio demo site; not a verified real person.",
    },
  ),
];

function rel(id: string, subject: string, predicate: string, object: string): PingRelationship {
  return {
    id,
    subject,
    predicate,
    object,
    status: "active",
    createdAt: OBSERVED_AT,
    evidenceRef: EVIDENCE_REF,
  };
}

const B = "object_6cc955e4077ad14f";
const W = "object_cda465c087b62af9";
const L = "object_f4be50f223741f51";

const relationships: PingRelationship[] = [
  rel("relationship_a959e1feefadeb8c", B, "has_website", W),
  rel("relationship_8b9588bc2cc434ba", B, "located_at", L),
  rel("relationship_61da895577c024f4", B, "offers", "object_fdce5190ab155923"),
  rel("relationship_c70091f66b48c9e8", B, "offers", "object_587e260b409b2de9"),
  rel("relationship_efebd852fbab53e1", B, "offers", "object_50fec066de21d77b"),
  rel("relationship_87a6cd70cf3f89d5", B, "offers", "object_daa1ea29cd83240b"),
  rel("relationship_252b04a43b403768", B, "employs", "object_5b5b3d32bca8145b"),
  rel("relationship_97fa1ffe7ed0d5bf", B, "employs", "object_9f01b2dede1da5d0"),
  rel("relationship_b16bb4aa06ac82b5", "object_5b5b3d32bca8145b", "member_of", B),
  rel("relationship_186a24ab09294301", "object_9f01b2dede1da5d0", "member_of", B),
];

export const HAPPY_PLACE_GRAPH: ObjectGraph = { objects, relationships };
