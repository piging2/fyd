/**
 * Buzz Electrical graph fixture: MACHINE-GENERATED, not hand-written.
 *
 * Script: /home/nolan/buzz-regen.ts
 * Timestamp pin: 2026-11-17T15:10:00Z
 * Pipeline git commit: 30b8dbd00cae4722ac94294b3a468f61fbc9cbb4
 * Source: https://buzzgj.com/
 * Source digest (sha256 over pinned raw bytes, file order: index.html, sitemap.website.xml): 577a1953b3feb394fc87a48fa2d35810b004b0966af362312cb061115dceacdd
 * Source files:
 *   index.html (html, 111385 bytes, sha256 6b606a464d1e2a852647de264d4d5efb37c3a68e30bcf4bfe42a283013d3e364)
 *   sitemap.website.xml (sitemap, 634 bytes, sha256 bbf1b95b12a96fc889443fb54e79151f6017836768394b17d251ba2b5c57012e)
 * observedAt: 2026-11-17T15:10:00Z
 * controllerId: identity_fyd_compiler_test
 *
 * Every claim is labeled website_statement: claimed by the website, never
 * verified fact. Do not hand-edit; regenerate with the script above.
 */

import type { ObjectGraph } from "../../sitespec/types";

export const BUZZ_ELECTRICAL_GRAPH: ObjectGraph = {
  "objects": [
    {
      "id": "website-business-a25be8046717e5ac",
      "schema": "ping.social.business@1",
      "controllerId": "identity_fyd_compiler_test",
      "visibility": "public",
      "title": "Buzz Electrical",
      "description": "See what the Buzz is all about! contractor",
      "fields": {
        "description": "See what the Buzz is all about! contractor",
        "images": "https://img1.wsimg.com/isteam/ip/2bc3f582-a1b5-40de-b9ba-a726acacd63c/home-electrician-near-manhasset-long-island-ny.jpg",
        "locale": "en_US",
        "phone": [
          "970-414-2899"
        ],
        "site_name": "Buzz Electrical",
        "title": "Buzz Electrical",
        "type": "website",
        "website": "buzzgj.com",
        "locality": "Grand Junction, CO, 81501, United States"
      },
      "createdAt": "2026-11-17T15:10:00Z",
      "updatedAt": "2026-11-17T15:10:00Z",
      "provenance": {
        "kind": "website-derived",
        "ref": "website-ingestion:https://buzzgj.com/",
        "derivedAt": "2026-11-17T15:10:00Z"
      }
    },
    {
      "id": "website-business-a25be8046717e5ac-location",
      "schema": "ping.social.location@1",
      "controllerId": "identity_fyd_compiler_test",
      "visibility": "public",
      "title": "Grand Junction, CO, 81501, United States",
      "description": "Coarse public location claim from the website's structured data.",
      "fields": {
        "address_locality": "Grand Junction",
        "address_region": "CO",
        "postal_code": "81501",
        "address_country": "United States",
        "locality": "Grand Junction, CO, 81501, United States",
        "claimKind": "website_statement"
      },
      "createdAt": "2026-11-17T15:10:00Z",
      "updatedAt": "2026-11-17T15:10:00Z",
      "provenance": {
        "kind": "website-derived",
        "ref": "website-ingestion:https://buzzgj.com/",
        "derivedAt": "2026-11-17T15:10:00Z"
      }
    }
  ],
  "relationships": [
    {
      "id": "rel-0ebf553f047bca76",
      "subject": "website-business-a25be8046717e5ac",
      "predicate": "located_at",
      "object": "website-business-a25be8046717e5ac-location",
      "status": "active",
      "createdAt": "2026-11-17T15:10:00Z",
      "evidenceRef": "proceduralizer:project:postal-address"
    }
  ]
};
