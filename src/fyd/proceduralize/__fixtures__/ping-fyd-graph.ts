/**
 * PING Social graph fixture: the owner-asserted PING knowledge base as the
 * PING-side dump recorded it. FAITHFUL COPY, not a synthesis.
 *
 * Source: /home/nolan/ping/var/fyd-projections/ping-fyd.json
 * Dumped: 2026-09-21T00:00:00.000Z (dumper fyd-dogfood-builder@1)
 * Recorded graphDigest: bd56fbed1e7ed91729e6671d5e1d9b94560fb7dff800dbc6d40322d982ec1562
 * Dump overlayEventIds: [] (no journaled overlays at dump time)
 *
 * Epistemic status (owner-asserted only):
 * - Every object carries the legacy provenance kind "owner-asserted" with
 *   ref "owner:tenant-config": facts the owner asserted into the tenant
 *   config, never website-observed or journal-recorded. The ask lane maps
 *   this kind to USER_OVERRIDE (see classificationFromProvenance), the same
 *   rank as the render binding-verifier's owner_asserted lane (b9a0201a).
 * - The knowledge base is hand-authored and stale (dumped 2026-09-21, 8
 *   days old as of 2026-09-29). Ask FYD must surface what IS there and
 *   refuse what is NOT (UNSUPPORTED), never fill gaps from model priors.
 * - All four service objects carry empty fields: services have titles and
 *   descriptions only. No pricing, no hours, no service-specific contact
 *   info exists in the base.
 *
 * Regeneration: re-derive from the PING-side dump (or the tenant-config
 * source of truth), never hand-edit to "improve" knowledge quality. Ask
 * quality improvements belong at the source, not inside this fixture.
 */

import type { ObjectGraph } from "../../sitespec/types";
import type { ObjectProvenanceKind } from "../../../lib/ping/types";

/**
 * The dump's legacy provenance kind for owner-asserted tenant facts. It was
 * dropped from the ObjectProvenanceKind vocabulary; the binding-verifier's
 * owner_asserted lane (LEGACY_OWNER_ASSERTED_KIND, b9a0201a) and the ask
 * lane's classificationFromProvenance handle the string at runtime. The
 * cast keeps this faithful copy type-correct WITHOUT re-adding the kind to
 * the vocabulary.
 */
const OWNER_ASSERTED = "owner-asserted" as ObjectProvenanceKind;

export const PING_FYD_GRAPH: ObjectGraph = {
  "objects": [
    {
      "id": "ping-fyd-business",
      "schema": "ping.social.business@1",
      "controllerId": "ping-fyd",
      "visibility": "public",
      "title": "PING Social",
      "description": "AI concierge and business automation for home service businesses.",
      "fields": {
        "phone": "(970) 589-3309",
        "locality": "Grand Junction, Colorado",
        "serviceArea": "Mesa County corridor: Grand Junction, Fruita, Palisade, Clifton, Collbran, Loma, Mack, De Beque, plus Delta, Montrose, Rifle, Carbondale"
      },
      "createdAt": "2026-09-21T00:00:00.000Z",
      "updatedAt": "2026-09-21T00:00:00.000Z",
      "provenance": {
        "kind": OWNER_ASSERTED,
        "ref": "owner:tenant-config",
        "derivedAt": "2026-09-21T00:00:00.000Z"
      }
    },
    {
      "id": "ping-fyd-svc-calls",
      "schema": "ping.social.service@1",
      "controllerId": "ping-fyd",
      "visibility": "public",
      "title": "AI call answering",
      "description": "An AI concierge answers when the crew is on a job, so no opportunity goes to voicemail.",
      "fields": {},
      "createdAt": "2026-09-21T00:00:00.000Z",
      "updatedAt": "2026-09-21T00:00:00.000Z",
      "provenance": {
        "kind": OWNER_ASSERTED,
        "ref": "owner:tenant-config",
        "derivedAt": "2026-09-21T00:00:00.000Z"
      }
    },
    {
      "id": "ping-fyd-svc-followup",
      "schema": "ping.social.service@1",
      "controllerId": "ping-fyd",
      "visibility": "public",
      "title": "Lead follow-up",
      "description": "Fast, consistent follow-up on every estimate request and inquiry.",
      "fields": {},
      "createdAt": "2026-09-21T00:00:00.000Z",
      "updatedAt": "2026-09-21T00:00:00.000Z",
      "provenance": {
        "kind": OWNER_ASSERTED,
        "ref": "owner:tenant-config",
        "derivedAt": "2026-09-21T00:00:00.000Z"
      }
    },
    {
      "id": "ping-fyd-svc-scheduling",
      "schema": "ping.social.service@1",
      "controllerId": "ping-fyd",
      "visibility": "public",
      "title": "Scheduling support",
      "description": "Fewer phone-tag loops getting jobs on the calendar.",
      "fields": {},
      "createdAt": "2026-09-21T00:00:00.000Z",
      "updatedAt": "2026-09-21T00:00:00.000Z",
      "provenance": {
        "kind": OWNER_ASSERTED,
        "ref": "owner:tenant-config",
        "derivedAt": "2026-09-21T00:00:00.000Z"
      }
    },
    {
      "id": "ping-fyd-svc-admin",
      "schema": "ping.social.service@1",
      "controllerId": "ping-fyd",
      "visibility": "public",
      "title": "Admin automation",
      "description": "Repetitive paperwork and organization handled quietly in the background.",
      "fields": {},
      "createdAt": "2026-09-21T00:00:00.000Z",
      "updatedAt": "2026-09-21T00:00:00.000Z",
      "provenance": {
        "kind": OWNER_ASSERTED,
        "ref": "owner:tenant-config",
        "derivedAt": "2026-09-21T00:00:00.000Z"
      }
    },
    {
      "id": "ping-fyd-location",
      "schema": "ping.social.location@1",
      "controllerId": "ping-fyd",
      "visibility": "public",
      "title": "Grand Junction, Colorado",
      "description": "",
      "fields": {
        "locality": "Grand Junction, Colorado"
      },
      "createdAt": "2026-09-21T00:00:00.000Z",
      "updatedAt": "2026-09-21T00:00:00.000Z",
      "provenance": {
        "kind": OWNER_ASSERTED,
        "ref": "owner:tenant-config",
        "derivedAt": "2026-09-21T00:00:00.000Z"
      }
    },
    {
      "id": "ping-fyd-facebook",
      "schema": "ping.social.external_identity@1",
      "controllerId": "ping-fyd",
      "visibility": "public",
      "title": "PING Social on Facebook",
      "description": "",
      "fields": {
        "platform": "facebook",
        "url": "https://www.facebook.com/profile.php?id=61594275542163"
      },
      "createdAt": "2026-09-21T00:00:00.000Z",
      "updatedAt": "2026-09-21T00:00:00.000Z",
      "provenance": {
        "kind": OWNER_ASSERTED,
        "ref": "owner:tenant-config",
        "derivedAt": "2026-09-21T00:00:00.000Z"
      }
    }
  ],
  "relationships": [
    {
      "id": "ping-fyd-rel-1",
      "subject": "ping-fyd-business",
      "predicate": "provides",
      "object": "ping-fyd-svc-calls",
      "status": "active",
      "createdAt": "2026-09-21T00:00:00.000Z",
      "evidenceRef": "owner:tenant-config"
    },
    {
      "id": "ping-fyd-rel-2",
      "subject": "ping-fyd-business",
      "predicate": "provides",
      "object": "ping-fyd-svc-followup",
      "status": "active",
      "createdAt": "2026-09-21T00:00:00.000Z",
      "evidenceRef": "owner:tenant-config"
    },
    {
      "id": "ping-fyd-rel-3",
      "subject": "ping-fyd-business",
      "predicate": "provides",
      "object": "ping-fyd-svc-scheduling",
      "status": "active",
      "createdAt": "2026-09-21T00:00:00.000Z",
      "evidenceRef": "owner:tenant-config"
    },
    {
      "id": "ping-fyd-rel-4",
      "subject": "ping-fyd-business",
      "predicate": "provides",
      "object": "ping-fyd-svc-admin",
      "status": "active",
      "createdAt": "2026-09-21T00:00:00.000Z",
      "evidenceRef": "owner:tenant-config"
    },
    {
      "id": "ping-fyd-rel-5",
      "subject": "ping-fyd-business",
      "predicate": "located_at",
      "object": "ping-fyd-location",
      "status": "active",
      "createdAt": "2026-09-21T00:00:00.000Z",
      "evidenceRef": "owner:tenant-config"
    },
    {
      "id": "ping-fyd-rel-6",
      "subject": "ping-fyd-business",
      "predicate": "links_to",
      "object": "ping-fyd-facebook",
      "status": "active",
      "createdAt": "2026-09-21T00:00:00.000Z",
      "evidenceRef": "owner:tenant-config"
    }
  ]
};
