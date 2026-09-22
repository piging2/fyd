/**
 * Coppersmith Plumbing & HVAC graph fixture: MACHINE-GENERATED, not hand-written.
 *
 * Script: /home/nolan/fyd-proof-run/regen.ts
 * Timestamp pin: 2026-09-21T13:50:00Z
 * Pipeline git commit: 3e30503b3b819d820c276d4dc379048baba7c27e
 * Source: https://www.coppersmithplumbing.com/
 * Source digest (sha256 over pinned raw bytes, file order: index.html, rss.xml, sitemap.xml): 5e9f1433566b21e864a74f8e36950207465a67265a945f449fe72342c005a70e
 * Source files:
 *   index.html (html, 117898 bytes, sha256 0584ea7b2965e67dc1db77ee672c26c296831f76f2c6f2da0e93b4188413c75d)
 *   rss.xml (rss, 1133 bytes, sha256 2c7bc75a428b4ecfa580287e4f52e354605cf49a5539e9813f50932fd087d9a4)
 *   sitemap.xml (sitemap, 569 bytes, sha256 fc2f1c16e5c957c172f0672d0abe5496841e17330d5918e632e069d345fa5da9)
 * observedAt: 2026-09-21T13:50:00Z
 * controllerId: identity_fyd_compiler_test
 *
 * Every claim is labeled website_statement: claimed by the website, never
 * verified fact. Do not hand-edit; regenerate with the script above.
 */

import type { ObjectGraph } from "../../sitespec/types";

export const COPPERSMITH_GRAPH: ObjectGraph = {
  "objects": [
    {
      "id": "website-business-2f1327c09d622175",
      "schema": "ping.social.business@1",
      "controllerId": "identity_fyd_compiler_test",
      "visibility": "public",
      "title": "Coppersmith Plumbing - HVAC - Mechanical",
      "description": "Coppersmith Plumbing & HVAC has serviced Western Colorado for over 25 years. With a proven track record of quality work and diverse skill sets, our team",
      "fields": {
        "description": "Coppersmith Plumbing & HVAC has serviced Western Colorado for over 25 years. With a proven track record of quality work and diverse skill sets, our team",
        "hours": "Mo,Tu,We,Th,Fr 07:30-16:00",
        "locale": "en_US",
        "phone": "970-245-3869",
        "site_name": "Coppersmith Plumbing - HVAC - Mechanical",
        "title": "Coppersmith Plumbing - HVAC - Mechanical",
        "type": "website",
        "updated_time": "2025-10-01T10:31:10-06:00",
        "website": "https://coppersmithplumbing.com",
        "locality": "Grand Junction, Colorado, 81501, United States"
      },
      "createdAt": "2026-09-21T13:50:00Z",
      "updatedAt": "2026-09-21T13:50:00Z",
      "provenance": {
        "kind": "website-derived",
        "ref": "website-ingestion:https://www.coppersmithplumbing.com/",
        "derivedAt": "2026-09-21T13:50:00Z"
      }
    },
    {
      "id": "website-business-2f1327c09d622175-ext-89604af059c2",
      "schema": "ping.social.external_identity@1",
      "controllerId": "identity_fyd_compiler_test",
      "visibility": "public",
      "title": "coppersmithplumbing.com",
      "description": "External profile linked from the website's structured data.",
      "fields": {
        "url": "https://coppersmithplumbing.com",
        "platform": "coppersmithplumbing.com",
        "claimKind": "website_statement"
      },
      "createdAt": "2026-09-21T13:50:00Z",
      "updatedAt": "2026-09-21T13:50:00Z",
      "provenance": {
        "kind": "website-derived",
        "ref": "website-ingestion:https://www.coppersmithplumbing.com/",
        "derivedAt": "2026-09-21T13:50:00Z"
      }
    },
    {
      "id": "website-business-2f1327c09d622175-location",
      "schema": "ping.social.location@1",
      "controllerId": "identity_fyd_compiler_test",
      "visibility": "public",
      "title": "Grand Junction, Colorado, 81501, United States",
      "description": "Coarse public location claim from the website's structured data.",
      "fields": {
        "address_locality": "Grand Junction",
        "address_region": "Colorado",
        "postal_code": "81501",
        "address_country": "United States",
        "locality": "Grand Junction, Colorado, 81501, United States",
        "claimKind": "website_statement"
      },
      "createdAt": "2026-09-21T13:50:00Z",
      "updatedAt": "2026-09-21T13:50:00Z",
      "provenance": {
        "kind": "website-derived",
        "ref": "website-ingestion:https://www.coppersmithplumbing.com/",
        "derivedAt": "2026-09-21T13:50:00Z"
      }
    },
    {
      "id": "website-business-2f1327c09d622175-person-377048d67856",
      "schema": "ping.social.person@1",
      "controllerId": "identity_fyd_compiler_test",
      "visibility": "public",
      "title": "coppersmithplm",
      "description": "Person described in the website's structured data.",
      "fields": {
        "name": "coppersmithplm",
        "claimKind": "website_statement"
      },
      "createdAt": "2026-09-21T13:50:00Z",
      "updatedAt": "2026-09-21T13:50:00Z",
      "provenance": {
        "kind": "website-derived",
        "ref": "website-ingestion:https://www.coppersmithplumbing.com/",
        "derivedAt": "2026-09-21T13:50:00Z"
      }
    },
    {
      "id": "website-business-2f1327c09d622175-service-139408827c27",
      "schema": "ping.social.service@1",
      "controllerId": "identity_fyd_compiler_test",
      "visibility": "public",
      "title": "Plumbing",
      "description": "Are you working on new construction for residential homes or commercial buildings?",
      "fields": {
        "name": "Plumbing",
        "description": "Are you working on new construction for residential homes or commercial buildings?",
        "service_href": "https://coppersmithplumbing.com/services/plumbing/",
        "claimKind": "website_statement"
      },
      "createdAt": "2026-09-21T13:50:00Z",
      "updatedAt": "2026-09-21T13:50:00Z",
      "provenance": {
        "kind": "website-derived",
        "ref": "website-ingestion:https://www.coppersmithplumbing.com/",
        "derivedAt": "2026-09-21T13:50:00Z"
      }
    },
    {
      "id": "website-business-2f1327c09d622175-service-2dbc12c16f83",
      "schema": "ping.social.service@1",
      "controllerId": "identity_fyd_compiler_test",
      "visibility": "public",
      "title": "Heating & Cooling",
      "description": "We maintain or repair furnaces, air conditioning units, heat pumps, mini split systems and more.",
      "fields": {
        "name": "Heating & Cooling",
        "description": "We maintain or repair furnaces, air conditioning units, heat pumps, mini split systems and more.",
        "service_href": "https://coppersmithplumbing.com/services/hvac/cooling/",
        "claimKind": "website_statement"
      },
      "createdAt": "2026-09-21T13:50:00Z",
      "updatedAt": "2026-09-21T13:50:00Z",
      "provenance": {
        "kind": "website-derived",
        "ref": "website-ingestion:https://www.coppersmithplumbing.com/",
        "derivedAt": "2026-09-21T13:50:00Z"
      }
    },
    {
      "id": "website-business-2f1327c09d622175-service-78962f315c55",
      "schema": "ping.social.service@1",
      "controllerId": "identity_fyd_compiler_test",
      "visibility": "public",
      "title": "HVAC",
      "description": "We set up complete heating, cooling, and ventilation systems. Get your HVAC needs done.",
      "fields": {
        "name": "HVAC",
        "description": "We set up complete heating, cooling, and ventilation systems. Get your HVAC needs done.",
        "service_href": "https://coppersmithplumbing.com/services/hvac/",
        "claimKind": "website_statement"
      },
      "createdAt": "2026-09-21T13:50:00Z",
      "updatedAt": "2026-09-21T13:50:00Z",
      "provenance": {
        "kind": "website-derived",
        "ref": "website-ingestion:https://www.coppersmithplumbing.com/",
        "derivedAt": "2026-09-21T13:50:00Z"
      }
    },
    {
      "id": "website-business-2f1327c09d622175-service-a2008c93fb04",
      "schema": "ping.social.service@1",
      "controllerId": "identity_fyd_compiler_test",
      "visibility": "public",
      "title": "Ventilation",
      "description": "Building a new office complex or need the current system assessed? Our specialists can help.",
      "fields": {
        "name": "Ventilation",
        "description": "Building a new office complex or need the current system assessed? Our specialists can help.",
        "service_href": "https://coppersmithplumbing.com/services/hvac/ventilation/",
        "claimKind": "website_statement"
      },
      "createdAt": "2026-09-21T13:50:00Z",
      "updatedAt": "2026-09-21T13:50:00Z",
      "provenance": {
        "kind": "website-derived",
        "ref": "website-ingestion:https://www.coppersmithplumbing.com/",
        "derivedAt": "2026-09-21T13:50:00Z"
      }
    }
  ],
  "relationships": [
    {
      "id": "rel-095378b4d4a047a4",
      "subject": "website-business-2f1327c09d622175",
      "predicate": "offers",
      "object": "website-business-2f1327c09d622175-service-2dbc12c16f83",
      "status": "active",
      "createdAt": "2026-09-21T13:50:00Z",
      "evidenceRef": "proceduralizer:project:service-card:elementor-cta-services:cooling"
    },
    {
      "id": "rel-8627fe1497c235f5",
      "subject": "website-business-2f1327c09d622175-person-377048d67856",
      "predicate": "works_for",
      "object": "website-business-2f1327c09d622175",
      "status": "active",
      "createdAt": "2026-09-21T13:50:00Z",
      "evidenceRef": "proceduralizer:structured:worksFor"
    },
    {
      "id": "rel-9a6aa2e50f4789ed",
      "subject": "website-business-2f1327c09d622175-person-377048d67856",
      "predicate": "links_to",
      "object": "website-business-2f1327c09d622175-ext-89604af059c2",
      "status": "active",
      "createdAt": "2026-09-21T13:50:00Z",
      "evidenceRef": "proceduralizer:project:sameAs:https://www.coppersmithplumbing.com/author/coppersmithplm/"
    },
    {
      "id": "rel-bbe63e103139111b",
      "subject": "website-business-2f1327c09d622175",
      "predicate": "offers",
      "object": "website-business-2f1327c09d622175-service-a2008c93fb04",
      "status": "active",
      "createdAt": "2026-09-21T13:50:00Z",
      "evidenceRef": "proceduralizer:project:service-card:elementor-cta-services:ventilation"
    },
    {
      "id": "rel-d0a40ed4fc7eb0ab",
      "subject": "website-business-2f1327c09d622175",
      "predicate": "located_at",
      "object": "website-business-2f1327c09d622175-location",
      "status": "active",
      "createdAt": "2026-09-21T13:50:00Z",
      "evidenceRef": "proceduralizer:project:postal-address"
    },
    {
      "id": "rel-de5dba2de5173fc0",
      "subject": "website-business-2f1327c09d622175",
      "predicate": "offers",
      "object": "website-business-2f1327c09d622175-service-78962f315c55",
      "status": "active",
      "createdAt": "2026-09-21T13:50:00Z",
      "evidenceRef": "proceduralizer:project:service-card:elementor-cta-services:hvac"
    },
    {
      "id": "rel-f450fdb901a6baa3",
      "subject": "website-business-2f1327c09d622175",
      "predicate": "offers",
      "object": "website-business-2f1327c09d622175-service-139408827c27",
      "status": "active",
      "createdAt": "2026-09-21T13:50:00Z",
      "evidenceRef": "proceduralizer:project:service-card:elementor-cta-services:plumbing"
    }
  ]
};
