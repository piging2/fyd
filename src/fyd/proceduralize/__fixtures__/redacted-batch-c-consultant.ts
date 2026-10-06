/**
 * Redacted fixture, batch C (professional): solo business consultant.
 *
 * HAND-AUTHORED, fully synthetic. Every name, address, email, and claim
 * in this file is fictional and marked DEMO_SYNTHETIC. No real business,
 * person, credential, or outcome is described here.
 *
 * Provenance contract: all objects carry provenance.kind
 * "overlay-authored", which the FYD ask lane classifies as
 * DEMO_SYNTHETIC (never DIRECT_FACT, never website_statement). Do NOT
 * change the provenance kind to website-derived or canonical-journal.
 *
 * Shape: the sparse-evidence fixture. One person, one coarse location,
 * two minimal services, three articles with empty descriptions and no
 * dates or tags (tests UNKNOWN handling for missing optional fields).
 * No phone anywhere: contact is form-first via contact_url plus email
 * and website. Every contact method listed is renderable: website opens
 * the site, email opens a mailto, contact_url opens the contact form.
 * No hours are published.
 *
 * Redaction markers: addresses are placeholders, emails use .example.com.
 */

import type { PingObject, PingRelationship } from "../../sitespec/types";

const TS = "2026-09-24T00:30:00Z";
const CONTROLLER = "identity_fyd_factory_batch_c";
const PROV_REF = "fyd-factory:redacted:batch-c:consultant";

function provenance() {
  return {
    kind: "overlay-authored" as const,
    ref: PROV_REF,
    derivedAt: TS,
  };
}

function claimFields(extra: Record<string, string | string[]>): Record<string, string | string[]> {
  return {
    redaction_class: "DEMO_SYNTHETIC",
    synthetic_note: "Fictional demo persona; not a real person or business.",
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
    createdAt: TS,
    updatedAt: TS,
    provenance: provenance(),
  };
}

function rel(
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
    evidenceRef: "redacted-batch-c:" + predicate + ":consultant:" + id,
  };
}

const BIZ = "redacted-batch-c-consultant-biz";
const P1 = "redacted-batch-c-consultant-person-1";
const LOC = "redacted-batch-c-consultant-loc-1";

const objects: PingObject[] = [
  obj(
    BIZ,
    "ping.social.business@1",
    "High Desert Consulting Co.",
    "A fictional solo business consultant. This profile is intentionally sparse: no hours, no phone, contact by form or email.",
    {
      category: "Business consultant",
      email: "hello@highdesert-consulting.example.com",
      website: "https://highdesert-consulting.example.com",
      contact_url: "https://highdesert-consulting.example.com/contact",
      area_served: "Western Colorado",
    },
  ),
  obj(
    LOC,
    "ping.social.location@1",
    "Western Colorado",
    "Coarse service area for the fictional consultant. Not a precise location.",
    {
      kind: "service_area",
      address_region: "CO",
      address_country: "US",
      locality: "Western Colorado, US",
    },
  ),
  obj(
    P1,
    "ping.social.person@1",
    "Chris Avery",
    "Fictional founder of the demo consulting practice.",
    {
      role: "founder",
    },
  ),
  obj(
    "redacted-batch-c-consultant-svc-1",
    "ping.social.service@1",
    "Operations review",
    "A two-week look at how work actually moves through the business.",
    { name: "Operations review" },
  ),
  obj(
    "redacted-batch-c-consultant-svc-2",
    "ping.social.service@1",
    "Process documentation",
    "The important workflows written down so they survive turnover.",
    { name: "Process documentation" },
  ),
  // Sparse articles: titles only. Missing text, date, and tags on purpose
  // to exercise UNKNOWN handling for absent optional fields.
  obj(
    "redacted-batch-c-consultant-article-1",
    "ping.social.article@1",
    "Three questions before you hire a consultant",
    "",
    {},
  ),
  obj(
    "redacted-batch-c-consultant-article-2",
    "ping.social.article@1",
    "A one-page business plan template",
    "",
    {},
  ),
  obj(
    "redacted-batch-c-consultant-article-3",
    "ping.social.article@1",
    "When process beats tools",
    "",
    {},
  ),
];

const relationships: PingRelationship[] = [
  rel("redacted-batch-c-consultant-rel-001", BIZ, "located_at", LOC),
  rel("redacted-batch-c-consultant-rel-002", BIZ, "employs", P1),
  rel("redacted-batch-c-consultant-rel-003", P1, "member_of", BIZ),
  rel("redacted-batch-c-consultant-rel-004", BIZ, "offers", "redacted-batch-c-consultant-svc-1"),
  rel("redacted-batch-c-consultant-rel-005", BIZ, "offers", "redacted-batch-c-consultant-svc-2"),
  rel("redacted-batch-c-consultant-rel-006", BIZ, "publishes", "redacted-batch-c-consultant-article-1"),
  rel("redacted-batch-c-consultant-rel-007", BIZ, "publishes", "redacted-batch-c-consultant-article-2"),
  rel("redacted-batch-c-consultant-rel-008", BIZ, "publishes", "redacted-batch-c-consultant-article-3"),
];

export const REDACTED_BATCH_C_CONSULTANT_GRAPH = { objects, relationships };
