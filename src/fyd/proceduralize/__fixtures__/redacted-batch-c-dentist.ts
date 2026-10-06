/**
 * Redacted fixture, batch C (professional): dental practice.
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
 * Shape: people-heavy (3 staff), 2 locations, hours present, phone
 * present, 4 services, 2 proof/case-study projects, 2 articles.
 *
 * Redaction markers: phones are (970) 555-01xx fictional range,
 * addresses are placeholders, emails use .example.com.
 */

import type { PingObject, PingRelationship } from "../../sitespec/types";

const TS = "2026-09-24T00:30:00Z";
const CONTROLLER = "identity_fyd_factory_batch_c";
const PROV_REF = "fyd-factory:redacted:batch-c:dentist";

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
    evidenceRef: "redacted-batch-c:" + predicate + ":dentist:" + id,
  };
}

const BIZ = "redacted-batch-c-dentist-biz";
const P1 = "redacted-batch-c-dentist-person-1";
const P2 = "redacted-batch-c-dentist-person-2";
const P3 = "redacted-batch-c-dentist-person-3";
const LOC1 = "redacted-batch-c-dentist-loc-1";
const LOC2 = "redacted-batch-c-dentist-loc-2";

const objects: PingObject[] = [
  obj(
    BIZ,
    "ping.social.business@1",
    "Blue Spruce Dental",
    "A fictional family dental practice in the Grand Valley. Cleanings, fillings, crowns, and clear aligner consultations by appointment.",
    {
      category: "Dentist",
      phone: "(970) 555-0140",
      email: "hello@bluespruce-dental.example.com",
      website: "https://bluespruce-dental.example.com",
      hours: "Mo,Tu,We,Th 08:00-17:00; Fr 08:00-14:00",
      area_served: "Grand Junction and Fruita, Colorado",
      address_placeholder: "1200 Example Blvd, Grand Junction, CO 81501",
      price_range: "$$",
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
    "Fruita satellite office",
    "Coarse placeholder location for the fictional satellite office. Not a real address.",
    {
      kind: "office",
      address_locality: "Fruita",
      address_region: "CO",
      address_country: "US",
      locality: "Fruita, CO, US",
    },
  ),
  obj(
    P1,
    "ping.social.person@1",
    "Avery Quinn",
    "Fictional dentist persona at the demo practice.",
    {
      role: "dentist",
    },
  ),
  obj(
    P2,
    "ping.social.person@1",
    "Morgan Ellis",
    "Fictional dental hygienist persona at the demo practice.",
    {
      role: "dental hygienist",
    },
  ),
  obj(
    P3,
    "ping.social.person@1",
    "Riley Park",
    "Fictional front desk coordinator persona at the demo practice.",
    {
      role: "front desk coordinator",
    },
  ),
  obj(
    "redacted-batch-c-dentist-svc-1",
    "ping.social.service@1",
    "Routine cleanings",
    "Twice-a-year cleanings with an exam and x-rays as needed.",
    { name: "Routine cleanings", duration: "about 60 minutes" },
  ),
  obj(
    "redacted-batch-c-dentist-svc-2",
    "ping.social.service@1",
    "Tooth-colored fillings",
    "Composite fillings matched to the shade of the tooth.",
    { name: "Tooth-colored fillings" },
  ),
  obj(
    "redacted-batch-c-dentist-svc-3",
    "ping.social.service@1",
    "Crowns",
    "Porcelain and zirconia crowns, usually two visits.",
    { name: "Crowns" },
  ),
  obj(
    "redacted-batch-c-dentist-svc-4",
    "ping.social.service@1",
    "Clear aligner consultations",
    "An evaluation to see whether clear aligners fit the case.",
    { name: "Clear aligner consultations" },
  ),
  obj(
    "redacted-batch-c-dentist-proof-1",
    "ping.social.project@1",
    "New-patient onboarding refresh",
    "Demo case study: the fictional practice rewrote its intake paperwork so first visits start on time. Fictional outcome, illustrative only.",
    { kind: "case_study" },
  ),
  obj(
    "redacted-batch-c-dentist-proof-2",
    "ping.social.project@1",
    "Family block scheduling pilot",
    "Demo case study: the fictional practice tried booking family members back-to-back to cut down on trips. Fictional outcome, illustrative only.",
    { kind: "case_study" },
  ),
  obj(
    "redacted-batch-c-dentist-article-1",
    "ping.social.article@1",
    "What to expect at your first visit",
    "A short walkthrough of a first appointment: paperwork, x-rays, exam, and a cleaning plan.",
    {
      text: "A short walkthrough of a first appointment: paperwork, x-rays, exam, and a cleaning plan.",
      date: "2026-09-01",
      tags: ["new patients", "visits"],
      url: "https://bluespruce-dental.example.com/articles/first-visit",
    },
  ),
  obj(
    "redacted-batch-c-dentist-article-2",
    "ping.social.article@1",
    "Brushing basics for busy mornings",
    "Two minutes, twice a day, with a soft brush. The demo practice keeps it simple.",
    {
      text: "Two minutes, twice a day, with a soft brush. The demo practice keeps it simple.",
      date: "2026-09-08",
      tags: ["hygiene"],
      url: "https://bluespruce-dental.example.com/articles/brushing-basics",
    },
  ),
];

const relationships: PingRelationship[] = [
  rel("redacted-batch-c-dentist-rel-001", BIZ, "located_at", LOC1),
  rel("redacted-batch-c-dentist-rel-002", BIZ, "located_at", LOC2),
  rel("redacted-batch-c-dentist-rel-003", BIZ, "employs", P1),
  rel("redacted-batch-c-dentist-rel-004", BIZ, "employs", P2),
  rel("redacted-batch-c-dentist-rel-005", BIZ, "employs", P3),
  rel("redacted-batch-c-dentist-rel-006", P1, "member_of", BIZ),
  rel("redacted-batch-c-dentist-rel-007", P2, "member_of", BIZ),
  rel("redacted-batch-c-dentist-rel-008", P3, "member_of", BIZ),
  rel("redacted-batch-c-dentist-rel-009", BIZ, "offers", "redacted-batch-c-dentist-svc-1"),
  rel("redacted-batch-c-dentist-rel-010", BIZ, "offers", "redacted-batch-c-dentist-svc-2"),
  rel("redacted-batch-c-dentist-rel-011", BIZ, "offers", "redacted-batch-c-dentist-svc-3"),
  rel("redacted-batch-c-dentist-rel-012", BIZ, "offers", "redacted-batch-c-dentist-svc-4"),
  rel("redacted-batch-c-dentist-rel-013", BIZ, "publishes", "redacted-batch-c-dentist-proof-1"),
  rel("redacted-batch-c-dentist-rel-014", BIZ, "publishes", "redacted-batch-c-dentist-proof-2"),
  rel("redacted-batch-c-dentist-rel-015", BIZ, "publishes", "redacted-batch-c-dentist-article-1"),
  rel("redacted-batch-c-dentist-rel-016", BIZ, "publishes", "redacted-batch-c-dentist-article-2"),
];

export const REDACTED_BATCH_C_DENTIST_GRAPH = { objects, relationships };
