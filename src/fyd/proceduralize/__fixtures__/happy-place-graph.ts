/**
 * Happy Place graph fixture: MACHINE-GENERATED, not hand-written.
 *
 * Script: /home/nolan/fyd-proof-run/regen.ts
 * Timestamp pin: 2026-09-21T13:50:00Z
 * Pipeline git commit: 3e30503b3b819d820c276d4dc379048baba7c27e
 * Source: https://happy-place-platform.vercel.app/
 * Source digest (sha256 over pinned raw bytes, file order: index.html): 76766d18a3f054e1e545124d0cfc9f5d48e242d1b7c746e9ebc5dbf555936d78
 * Source files:
 *   index.html (html, 139618 bytes, sha256 76766d18a3f054e1e545124d0cfc9f5d48e242d1b7c746e9ebc5dbf555936d78)
 * observedAt: 2026-09-21T13:50:00Z
 * controllerId: identity_fyd_compiler_test
 *
 * Every claim is labeled website_statement: claimed by the website, never
 * verified fact. Do not hand-edit; regenerate with the script above.
 */

import type { ObjectGraph } from "../../sitespec/types";

export const HAPPY_PLACE_GRAPH: ObjectGraph = {
  "objects": [
    {
      "id": "website-business-6fa5ebd99d72c4cb",
      "schema": "ping.social.business@1",
      "controllerId": "identity_fyd_compiler_test",
      "visibility": "public",
      "title": "Happy Place Carpentry LLC",
      "description": "Licensed Oregon carpentry contractor (CCB# 254240) building decks, fences, pergolas, bathrooms, and custom work across Benton, Linn, Marion & Polk Counties.",
      "fields": {
        "area_served": "Benton, Linn, Marion, and Polk Counties, Oregon",
        "description": "Licensed Oregon carpentry contractor (CCB# 254240) building decks, fences, pergolas, bathrooms, and custom work across Benton, Linn, Marion & Polk Counties.",
        "email": "taylor@happyplacecarpentry.com",
        "images": "https://happyplacecarpentry.com/images/hero-background-enhanced.jpg",
        "keywords": "carpenter,deck builder,fence installer,bathroom remodel,Oregon contractor,Willamette Valley",
        "phone": "+15412865190",
        "price_range": "$$",
        "title": "Happy Place Carpentry LLC",
        "website": "https://happyplacecarpentry.com",
        "locality": "Adair Village, OR, US"
      },
      "createdAt": "2026-09-21T13:50:00Z",
      "updatedAt": "2026-09-21T13:50:00Z",
      "provenance": {
        "kind": "website-derived",
        "ref": "website-ingestion:https://happy-place-platform.vercel.app/",
        "derivedAt": "2026-09-21T13:50:00Z"
      }
    },
    {
      "id": "website-business-6fa5ebd99d72c4cb-location",
      "schema": "ping.social.location@1",
      "controllerId": "identity_fyd_compiler_test",
      "visibility": "public",
      "title": "Adair Village, OR, US",
      "description": "Coarse public location claim from the website's structured data.",
      "fields": {
        "address_locality": "Adair Village",
        "address_region": "OR",
        "address_country": "US",
        "locality": "Adair Village, OR, US",
        "claimKind": "website_statement"
      },
      "createdAt": "2026-09-21T13:50:00Z",
      "updatedAt": "2026-09-21T13:50:00Z",
      "provenance": {
        "kind": "website-derived",
        "ref": "website-ingestion:https://happy-place-platform.vercel.app/",
        "derivedAt": "2026-09-21T13:50:00Z"
      }
    },
    {
      "id": "website-business-6fa5ebd99d72c4cb-service-3263502c8175",
      "schema": "ping.social.service@1",
      "controllerId": "identity_fyd_compiler_test",
      "visibility": "public",
      "title": "Repairs",
      "description": "Small problems usually tell you about a bigger one. Fix them early and they're repairs. Wait too long and they become replacements.",
      "fields": {
        "name": "Repairs",
        "description": "Small problems usually tell you about a bigger one. Fix them early and they're repairs. Wait too long and they become replacements.",
        "service_href": "/estimate?service=repairs",
        "claimKind": "website_statement"
      },
      "createdAt": "2026-09-21T13:50:00Z",
      "updatedAt": "2026-09-21T13:50:00Z",
      "provenance": {
        "kind": "website-derived",
        "ref": "website-ingestion:https://happy-place-platform.vercel.app/",
        "derivedAt": "2026-09-21T13:50:00Z"
      }
    },
    {
      "id": "website-business-6fa5ebd99d72c4cb-service-340c39513223",
      "schema": "ping.social.service@1",
      "controllerId": "identity_fyd_compiler_test",
      "visibility": "public",
      "title": "Fencing",
      "description": "A fence should stay straight, the gate should close without dragging, and it should still look good after a few Oregon winters.",
      "fields": {
        "name": "Fencing",
        "description": "A fence should stay straight, the gate should close without dragging, and it should still look good after a few Oregon winters.",
        "service_href": "/estimate?service=fences",
        "claimKind": "website_statement"
      },
      "createdAt": "2026-09-21T13:50:00Z",
      "updatedAt": "2026-09-21T13:50:00Z",
      "provenance": {
        "kind": "website-derived",
        "ref": "website-ingestion:https://happy-place-platform.vercel.app/",
        "derivedAt": "2026-09-21T13:50:00Z"
      }
    },
    {
      "id": "website-business-6fa5ebd99d72c4cb-service-7f1139c11dab",
      "schema": "ping.social.service@1",
      "controllerId": "identity_fyd_compiler_test",
      "visibility": "public",
      "title": "Painting",
      "description": "Most paint failures start before the first coat goes on. We clean, sand, repair damaged areas, and prime everything first, because good prep is what keeps paint on the house.",
      "fields": {
        "name": "Painting",
        "description": "Most paint failures start before the first coat goes on. We clean, sand, repair damaged areas, and prime everything first, because good prep is what keeps paint on the house.",
        "service_href": "/estimate?service=painting",
        "claimKind": "website_statement"
      },
      "createdAt": "2026-09-21T13:50:00Z",
      "updatedAt": "2026-09-21T13:50:00Z",
      "provenance": {
        "kind": "website-derived",
        "ref": "website-ingestion:https://happy-place-platform.vercel.app/",
        "derivedAt": "2026-09-21T13:50:00Z"
      }
    },
    {
      "id": "website-business-6fa5ebd99d72c4cb-service-c63c87ed8420",
      "schema": "ping.social.service@1",
      "controllerId": "identity_fyd_compiler_test",
      "visibility": "public",
      "title": "Drywall",
      "description": "From small hole repairs to full installations, we handle drywall work that's smooth, seamless, and ready for paint.",
      "fields": {
        "name": "Drywall",
        "description": "From small hole repairs to full installations, we handle drywall work that's smooth, seamless, and ready for paint.",
        "service_href": "/estimate?service=drywall",
        "claimKind": "website_statement"
      },
      "createdAt": "2026-09-21T13:50:00Z",
      "updatedAt": "2026-09-21T13:50:00Z",
      "provenance": {
        "kind": "website-derived",
        "ref": "website-ingestion:https://happy-place-platform.vercel.app/",
        "derivedAt": "2026-09-21T13:50:00Z"
      }
    },
    {
      "id": "website-business-6fa5ebd99d72c4cb-service-cd28e52699a5",
      "schema": "ping.social.service@1",
      "controllerId": "identity_fyd_compiler_test",
      "visibility": "public",
      "title": "Restoration",
      "description": "Bring worn surfaces back to life. We refinish fences, decks, and other woodwork to protect your investment and make your home look like new again.",
      "fields": {
        "name": "Restoration",
        "description": "Bring worn surfaces back to life. We refinish fences, decks, and other woodwork to protect your investment and make your home look like new again.",
        "service_href": "/estimate?service=restoration",
        "claimKind": "website_statement"
      },
      "createdAt": "2026-09-21T13:50:00Z",
      "updatedAt": "2026-09-21T13:50:00Z",
      "provenance": {
        "kind": "website-derived",
        "ref": "website-ingestion:https://happy-place-platform.vercel.app/",
        "derivedAt": "2026-09-21T13:50:00Z"
      }
    }
  ],
  "relationships": [
    {
      "id": "rel-835420c1cbef02bd",
      "subject": "website-business-6fa5ebd99d72c4cb",
      "predicate": "offers",
      "object": "website-business-6fa5ebd99d72c4cb-service-cd28e52699a5",
      "status": "active",
      "createdAt": "2026-09-21T13:50:00Z",
      "evidenceRef": "proceduralizer:project:service-card:estimate-service-card:restoration"
    },
    {
      "id": "rel-8b9388534baf1a33",
      "subject": "website-business-6fa5ebd99d72c4cb",
      "predicate": "offers",
      "object": "website-business-6fa5ebd99d72c4cb-service-7f1139c11dab",
      "status": "active",
      "createdAt": "2026-09-21T13:50:00Z",
      "evidenceRef": "proceduralizer:project:service-card:estimate-service-card:painting"
    },
    {
      "id": "rel-9932b58edd3551be",
      "subject": "website-business-6fa5ebd99d72c4cb",
      "predicate": "offers",
      "object": "website-business-6fa5ebd99d72c4cb-service-c63c87ed8420",
      "status": "active",
      "createdAt": "2026-09-21T13:50:00Z",
      "evidenceRef": "proceduralizer:project:service-card:estimate-service-card:drywall"
    },
    {
      "id": "rel-9b5d8035b2d8f54e",
      "subject": "website-business-6fa5ebd99d72c4cb",
      "predicate": "located_at",
      "object": "website-business-6fa5ebd99d72c4cb-location",
      "status": "active",
      "createdAt": "2026-09-21T13:50:00Z",
      "evidenceRef": "proceduralizer:project:postal-address"
    },
    {
      "id": "rel-ab9de2051a8531d5",
      "subject": "website-business-6fa5ebd99d72c4cb",
      "predicate": "offers",
      "object": "website-business-6fa5ebd99d72c4cb-service-3263502c8175",
      "status": "active",
      "createdAt": "2026-09-21T13:50:00Z",
      "evidenceRef": "proceduralizer:project:service-card:estimate-service-card:repairs"
    },
    {
      "id": "rel-c0fe44edf1dcfbfd",
      "subject": "website-business-6fa5ebd99d72c4cb",
      "predicate": "offers",
      "object": "website-business-6fa5ebd99d72c4cb-service-340c39513223",
      "status": "active",
      "createdAt": "2026-09-21T13:50:00Z",
      "evidenceRef": "proceduralizer:project:service-card:estimate-service-card:fences"
    }
  ]
};
