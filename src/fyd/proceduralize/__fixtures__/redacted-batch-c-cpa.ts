/**
 * Redacted fixture, batch C (professional): accounting / CPA practice.
 *
 * HAND-AUTHORED, fully synthetic. Every name, phone, address, email, and
 * claim in this file is fictional and marked DEMO_SYNTHETIC. No real
 * business, person, credential, or outcome is described here.
 *
 * Provenance contract: all objects carry provenance.kind
 * "overlay-authored", which the FYD ask lane classifies as
 * DEMO_SYNTHETIC (never DIRECT_FACT, never website_statement). Do NOT
 * change the provenance kind to website-derived or canonical-journal.
 *
 * Shape: 2 people plus a 5-item service list, 1 location, phone present,
 * no hours published, 1 article. The lean counterpart to the
 * dentist and law fixtures.
 *
 * Redaction markers: phones are (970) 555-01xx fictional range,
 * addresses are placeholders, emails use .example.com.
 */

import type { PingObject, PingRelationship } from "../../sitespec/types";

const TS = "2026-09-24T00:30:00Z";
const CONTROLLER = "identity_fyd_factory_batch_c";
const PROV_REF = "fyd-factory:redacted:batch-c:cpa";

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
    evidenceRef: "redacted-batch-c:" + predicate + ":cpa:" + id,
  };
}

const BIZ = "redacted-batch-c-cpa-biz";
const P1 = "redacted-batch-c-cpa-person-1";
const P2 = "redacted-batch-c-cpa-person-2";
const LOC = "redacted-batch-c-cpa-loc-1";

const objects: PingObject[] = [
  obj(
    BIZ,
    "ping.social.business@1",
    "Juniper Ridge Accounting LLC",
    "A fictional two-person accounting practice: tax preparation, bookkeeping, payroll, and small-business advisory for the valley.",
    {
      category: "Accountant",
      phone: "(970) 555-0143",
      email: "hello@juniperridge-accounting.example.com",
      website: "https://juniperridge-accounting.example.com",
      area_served: "Mesa County, Colorado",
      address_placeholder: "450 Example Way, Grand Junction, CO 81501",
    },
  ),
  obj(
    LOC,
    "ping.social.location@1",
    "Grand Junction office",
    "Coarse placeholder location for the fictional office. Not a real address.",
    {
      kind: "office",
      address_locality: "Grand Junction",
      address_region: "CO",
      address_country: "US",
      locality: "Grand Junction, CO, US",
    },
  ),
  obj(
    P1,
    "ping.social.person@1",
    "Jordan Ellis",
    "Fictional owner of the demo accounting practice.",
    {
      role: "owner",
    },
  ),
  obj(
    P2,
    "ping.social.person@1",
    "Taylor Brooks",
    "Fictional bookkeeper at the demo accounting practice.",
    {
      role: "bookkeeper",
    },
  ),
  obj(
    "redacted-batch-c-cpa-svc-1",
    "ping.social.service@1",
    "Tax preparation",
    "Individual and small-business returns, e-filed with copies kept on record.",
    { name: "Tax preparation" },
  ),
  obj(
    "redacted-batch-c-cpa-svc-2",
    "ping.social.service@1",
    "Monthly bookkeeping",
    "Categorized books, reconciled accounts, and a monthly summary a non-accountant can read.",
    { name: "Monthly bookkeeping" },
  ),
  obj(
    "redacted-batch-c-cpa-svc-3",
    "ping.social.service@1",
    "Payroll processing",
    "Pay runs, filings, and year-end forms for small crews.",
    { name: "Payroll processing" },
  ),
  obj(
    "redacted-batch-c-cpa-svc-4",
    "ping.social.service@1",
    "Accounting software setup",
    "Chart of accounts and opening balances, set up so the books make sense on day one.",
    { name: "Accounting software setup" },
  ),
  obj(
    "redacted-batch-c-cpa-svc-5",
    "ping.social.service@1",
    "Business advisory check-ins",
    "A quarterly look at the numbers with plain-language next steps.",
    { name: "Business advisory check-ins" },
  ),
  obj(
    "redacted-batch-c-cpa-article-1",
    "ping.social.article@1",
    "Small-business year-end checklist",
    "Gather 1099s, reconcile December, and review estimated payments before the year closes.",
    {
      text: "Gather 1099s, reconcile December, and review estimated payments before the year closes.",
      date: "2026-09-10",
      tags: ["taxes", "year-end"],
      url: "https://juniperridge-accounting.example.com/articles/year-end-checklist",
    },
  ),
];

const relationships: PingRelationship[] = [
  rel("redacted-batch-c-cpa-rel-001", BIZ, "located_at", LOC),
  rel("redacted-batch-c-cpa-rel-002", BIZ, "employs", P1),
  rel("redacted-batch-c-cpa-rel-003", BIZ, "employs", P2),
  rel("redacted-batch-c-cpa-rel-004", P1, "member_of", BIZ),
  rel("redacted-batch-c-cpa-rel-005", P2, "member_of", BIZ),
  rel("redacted-batch-c-cpa-rel-006", BIZ, "offers", "redacted-batch-c-cpa-svc-1"),
  rel("redacted-batch-c-cpa-rel-007", BIZ, "offers", "redacted-batch-c-cpa-svc-2"),
  rel("redacted-batch-c-cpa-rel-008", BIZ, "offers", "redacted-batch-c-cpa-svc-3"),
  rel("redacted-batch-c-cpa-rel-009", BIZ, "offers", "redacted-batch-c-cpa-svc-4"),
  rel("redacted-batch-c-cpa-rel-010", BIZ, "offers", "redacted-batch-c-cpa-svc-5"),
  rel("redacted-batch-c-cpa-rel-011", BIZ, "publishes", "redacted-batch-c-cpa-article-1"),
];

export const REDACTED_BATCH_C_CPA_GRAPH = { objects, relationships };
