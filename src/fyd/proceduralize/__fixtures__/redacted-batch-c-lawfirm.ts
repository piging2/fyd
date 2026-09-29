/**
 * Redacted fixture, batch C (professional): law firm.
 *
 * HAND-AUTHORED, fully synthetic. Every name, phone, address, email, and
 * claim in this file is fictional and marked DEMO_SYNTHETIC. No real
 * business, person, credential, license, school, award, or outcome is
 * described here. No bar numbers or years of experience are stated.
 *
 * Provenance contract: all objects carry provenance.kind
 * "overlay-authored", which the FYD ask lane classifies as
 * DEMO_SYNTHETIC (never DIRECT_FACT, never website_statement). Do NOT
 * change the provenance kind to website-derived or canonical-journal.
 *
 * Shape: people-heavy (4 attorneys, each with a practice area), 2
 * locations, hours present, phone present, 4 practice-area services,
 * 2 proof/case-study projects, 2 articles.
 *
 * Redaction markers: phones are (970) 555-01xx fictional range,
 * addresses are placeholders, emails use .example.com.
 */

import type { PingObject, PingRelationship } from "../../sitespec/types";

const TS = "2026-09-24T00:30:00Z";
const CONTROLLER = "identity_fyd_factory_batch_c";
const PROV_REF = "fyd-factory:redacted:batch-c:lawfirm";

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
    evidenceRef: "redacted-batch-c:" + predicate + ":lawfirm:" + id,
  };
}

const BIZ = "redacted-batch-c-lawfirm-biz";
const A1 = "redacted-batch-c-lawfirm-person-1";
const A2 = "redacted-batch-c-lawfirm-person-2";
const A3 = "redacted-batch-c-lawfirm-person-3";
const A4 = "redacted-batch-c-lawfirm-person-4";
const LOC1 = "redacted-batch-c-lawfirm-loc-1";
const LOC2 = "redacted-batch-c-lawfirm-loc-2";

const objects: PingObject[] = [
  obj(
    BIZ,
    "ping.social.business@1",
    "Ironwood Law Group",
    "A fictional four-attorney firm: estate planning, business law, real estate, and family law consultations by appointment.",
    {
      category: "Law firm",
      phone: "(970) 555-0145",
      email: "hello@ironwood-law.example.com",
      website: "https://ironwood-law.example.com",
      hours: "Mo,Tu,We,Th,Fr 09:00-17:00",
      area_served: "Mesa and Montrose Counties, Colorado",
      address_placeholder: "88 Example Plaza, Grand Junction, CO 81501",
    },
  ),
  obj(
    LOC1,
    "ping.social.location@1",
    "Grand Junction office",
    "Coarse placeholder location for the fictional main office. Not a real address.",
    {
      kind: "office",
      address_locality: "Grand Junction",
      address_region: "CO",
      address_country: "US",
      locality: "Grand Junction, CO, US",
    },
  ),
  obj(
    LOC2,
    "ping.social.location@1",
    "Montrose office",
    "Coarse placeholder location for the fictional second office. Not a real address.",
    {
      kind: "office",
      address_locality: "Montrose",
      address_region: "CO",
      address_country: "US",
      locality: "Montrose, CO, US",
    },
  ),
  obj(
    A1,
    "ping.social.person@1",
    "Alex Morgan",
    "Fictional attorney persona; practice area is estate planning.",
    {
      role: "attorney",
      practice_area: "estate planning",
    },
  ),
  obj(
    A2,
    "ping.social.person@1",
    "Riley Chen",
    "Fictional attorney persona; practice area is business law.",
    {
      role: "attorney",
      practice_area: "business law",
    },
  ),
  obj(
    A3,
    "ping.social.person@1",
    "Sam Delgado",
    "Fictional attorney persona; practice area is real estate.",
    {
      role: "attorney",
      practice_area: "real estate",
    },
  ),
  obj(
    A4,
    "ping.social.person@1",
    "Pat Kim",
    "Fictional attorney persona; practice area is family law.",
    {
      role: "attorney",
      practice_area: "family law",
    },
  ),
  obj(
    "redacted-batch-c-lawfirm-svc-1",
    "ping.social.service@1",
    "Estate planning",
    "Wills, trusts, and powers of attorney drafted around the family, not a template.",
    { name: "Estate planning" },
  ),
  obj(
    "redacted-batch-c-lawfirm-svc-2",
    "ping.social.service@1",
    "Business formation",
    "LLCs and operating agreements for new and growing businesses.",
    { name: "Business formation" },
  ),
  obj(
    "redacted-batch-c-lawfirm-svc-3",
    "ping.social.service@1",
    "Real estate closings",
    "Document review and closing support for residential and small commercial deals.",
    { name: "Real estate closings" },
  ),
  obj(
    "redacted-batch-c-lawfirm-svc-4",
    "ping.social.service@1",
    "Family law consultations",
    "An initial consultation to map options before anything is filed.",
    { name: "Family law consultations" },
  ),
  obj(
    "redacted-batch-c-lawfirm-proof-1",
    "ping.social.project@1",
    "Estate plan document package",
    "Demo case study: a sample package showing the documents in a typical plan. Fictional example, illustrative only.",
    { kind: "case_study" },
  ),
  obj(
    "redacted-batch-c-lawfirm-proof-2",
    "ping.social.project@1",
    "Commercial lease review",
    "Demo case study: a sample review checklist for a storefront lease. Fictional example, illustrative only.",
    { kind: "case_study" },
  ),
  obj(
    "redacted-batch-c-lawfirm-article-1",
    "ping.social.article@1",
    "Why small businesses use operating agreements",
    "An operating agreement settles ownership, money, and decisions before there is a disagreement.",
    {
      text: "An operating agreement settles ownership, money, and decisions before there is a disagreement.",
      date: "2026-09-05",
      tags: ["business law"],
      url: "https://ironwood-law.example.com/articles/operating-agreements",
    },
  ),
  obj(
    "redacted-batch-c-lawfirm-article-2",
    "ping.social.article@1",
    "What to bring to an estate planning consultation",
    "IDs, asset lists, beneficiary names, and any existing documents. A one-page checklist.",
    {
      text: "IDs, asset lists, beneficiary names, and any existing documents. A one-page checklist.",
      date: "2026-09-12",
      tags: ["estate planning"],
      url: "https://ironwood-law.example.com/articles/estate-planning-checklist",
    },
  ),
];

const relationships: PingRelationship[] = [
  rel("redacted-batch-c-lawfirm-rel-001", BIZ, "located_at", LOC1),
  rel("redacted-batch-c-lawfirm-rel-002", BIZ, "located_at", LOC2),
  rel("redacted-batch-c-lawfirm-rel-003", BIZ, "employs", A1),
  rel("redacted-batch-c-lawfirm-rel-004", BIZ, "employs", A2),
  rel("redacted-batch-c-lawfirm-rel-005", BIZ, "employs", A3),
  rel("redacted-batch-c-lawfirm-rel-006", BIZ, "employs", A4),
  rel("redacted-batch-c-lawfirm-rel-007", A1, "member_of", BIZ),
  rel("redacted-batch-c-lawfirm-rel-008", A2, "member_of", BIZ),
  rel("redacted-batch-c-lawfirm-rel-009", A3, "member_of", BIZ),
  rel("redacted-batch-c-lawfirm-rel-010", A4, "member_of", BIZ),
  rel("redacted-batch-c-lawfirm-rel-011", BIZ, "offers", "redacted-batch-c-lawfirm-svc-1"),
  rel("redacted-batch-c-lawfirm-rel-012", BIZ, "offers", "redacted-batch-c-lawfirm-svc-2"),
  rel("redacted-batch-c-lawfirm-rel-013", BIZ, "offers", "redacted-batch-c-lawfirm-svc-3"),
  rel("redacted-batch-c-lawfirm-rel-014", BIZ, "offers", "redacted-batch-c-lawfirm-svc-4"),
  rel("redacted-batch-c-lawfirm-rel-015", BIZ, "publishes", "redacted-batch-c-lawfirm-proof-1"),
  rel("redacted-batch-c-lawfirm-rel-016", BIZ, "publishes", "redacted-batch-c-lawfirm-proof-2"),
  rel("redacted-batch-c-lawfirm-rel-017", BIZ, "publishes", "redacted-batch-c-lawfirm-article-1"),
  rel("redacted-batch-c-lawfirm-rel-018", BIZ, "publishes", "redacted-batch-c-lawfirm-article-2"),
];

export const REDACTED_BATCH_C_LAWFIRM_GRAPH = { objects, relationships };
