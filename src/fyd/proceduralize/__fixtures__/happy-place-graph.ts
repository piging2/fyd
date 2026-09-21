/**
 * Happy Place graph fixture: MACHINE-GENERATED, not hand-written.
 *
 * Script: /home/nolan/fyd-proof-run/regen.ts
 * Timestamp pin: 2026-09-21T13:50:00Z
 * Pipeline git commit: 556c56f9bb67cb88bdac1aeb2dea6139763b5f10
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
    }
  ],
  "relationships": [
    {
      "id": "rel-9b5d8035b2d8f54e",
      "subject": "website-business-6fa5ebd99d72c4cb",
      "predicate": "located_at",
      "object": "website-business-6fa5ebd99d72c4cb-location",
      "status": "active",
      "createdAt": "2026-09-21T13:50:00Z",
      "evidenceRef": "proceduralizer:project:postal-address"
    }
  ]
};
