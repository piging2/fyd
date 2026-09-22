/**
 * Dogfood projection builder: PING Social's own tenant projection.
 *
 * WHAT THIS IS: the PING/FYD dogfood tenant ("ping-fyd"). FYD builds FYD:
 * PING Social's own business presence is compiled through the same
 * object-builder -> website-builder path as any customer tenant.
 *
 * EVIDENCE BASIS (honest): every fact below is OWNER-ASSERTED by PING
 * Social's owner (Nolan) about his own business: name, positioning,
 * service list, phone, service area, and the public Facebook Page. These
 * are the same facts recorded in the operator's standing business memory.
 * Nothing is scraped, nothing is invented, and no third party is described.
 * Provenance kind is "owner-asserted" with ref "owner:tenant-config" so the
 * facts are classified OWNER_AUTHORED, never DIRECT observations.
 *
 * DERIVATION (replayable): node build-ping-fyd-projection.mjs writes
 * /home/nolan/ping/var/fyd-projections/ping-fyd.json. The derivation is
 * deterministic: DOGFOOD_DERIVED_AT is a fixed constant so re-runs are
 * byte-identical, and meta.graphDigest is sha256 over the repo's own
 * canonicalize() (replicated verbatim from src/lib/ping/ask-composer.ts),
 * which src/fyd/data/ping-object-source.ts recomputes on every load.
 * If the projection file is deleted, re-running this script restores it.
 *
 * This script performs no network I/O and writes exactly one file.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const SITE_ID = "ping-fyd";
const PROJECTION_PATH = "/home/nolan/ping/var/fyd-projections/ping-fyd.json";
// Fixed so re-runs are byte-identical (replayable derivation).
const DOGFOOD_DERIVED_AT = "2026-09-21T00:00:00.000Z";
const PROV_REF = "owner:tenant-config";

/** Verbatim replica of canonicalize() from src/lib/ping/ask-composer.ts. */
function canonicalize(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(",")}}`;
  }
  return "null";
}

function obj(id, schema, title, description, fields) {
  return {
    id,
    schema,
    controllerId: SITE_ID,
    visibility: "public",
    title,
    description: description ?? "",
    fields: fields ?? {},
    createdAt: DOGFOOD_DERIVED_AT,
    updatedAt: DOGFOOD_DERIVED_AT,
    provenance: { kind: "owner-asserted", ref: PROV_REF, derivedAt: DOGFOOD_DERIVED_AT },
  };
}

function rel(id, subject, predicate, object) {
  return {
    id,
    subject,
    predicate,
    object,
    status: "active",
    createdAt: DOGFOOD_DERIVED_AT,
    evidenceRef: PROV_REF,
  };
}

const BIZ = "ping.social.business@1";
const SVC = "ping.social.service@1";
const LOC = "ping.social.location@1";
const EXT = "ping.social.external_identity@1";

const objects = [
  obj(
    "ping-fyd-business",
    BIZ,
    "PING Social",
    "AI concierge and business automation for home service businesses.",
    {
      phone: "(970) 589-3309",
      locality: "Grand Junction, Colorado",
      serviceArea:
        "Mesa County corridor: Grand Junction, Fruita, Palisade, Clifton, Collbran, Loma, Mack, De Beque, plus Delta, Montrose, Rifle, Carbondale",
    },
  ),
  obj(
    "ping-fyd-svc-calls",
    SVC,
    "AI call answering",
    "An AI concierge answers when the crew is on a job, so no opportunity goes to voicemail.",
    {},
  ),
  obj(
    "ping-fyd-svc-followup",
    SVC,
    "Lead follow-up",
    "Fast, consistent follow-up on every estimate request and inquiry.",
    {},
  ),
  obj(
    "ping-fyd-svc-scheduling",
    SVC,
    "Scheduling support",
    "Fewer phone-tag loops getting jobs on the calendar.",
    {},
  ),
  obj(
    "ping-fyd-svc-admin",
    SVC,
    "Admin automation",
    "Repetitive paperwork and organization handled quietly in the background.",
    {},
  ),
  obj(
    "ping-fyd-location",
    LOC,
    "Grand Junction, Colorado",
    "",
    { locality: "Grand Junction, Colorado" },
  ),
  obj(
    "ping-fyd-facebook",
    EXT,
    "PING Social on Facebook",
    "",
    {
      platform: "facebook",
      url: "https://www.facebook.com/profile.php?id=61594275542163",
    },
  ),
];

const relationships = [
  rel("ping-fyd-rel-1", "ping-fyd-business", "provides", "ping-fyd-svc-calls"),
  rel("ping-fyd-rel-2", "ping-fyd-business", "provides", "ping-fyd-svc-followup"),
  rel("ping-fyd-rel-3", "ping-fyd-business", "provides", "ping-fyd-svc-scheduling"),
  rel("ping-fyd-rel-4", "ping-fyd-business", "provides", "ping-fyd-svc-admin"),
  rel("ping-fyd-rel-5", "ping-fyd-business", "located_at", "ping-fyd-location"),
  rel("ping-fyd-rel-6", "ping-fyd-business", "links_to", "ping-fyd-facebook"),
];

const graph = { objects, relationships };
const graphDigest = createHash("sha256").update(canonicalize(graph), "utf8").digest("hex");

const doc = {
  graph,
  meta: {
    siteId: SITE_ID,
    dumpedAt: DOGFOOD_DERIVED_AT,
    dumperVersion: "fyd-dogfood-builder@1",
    baseDigest: "owner-asserted",
    fixtureFileDigest: "owner-asserted",
    graphDigest,
    generatedAt: DOGFOOD_DERIVED_AT,
    overlayEventIds: [],
  },
};

writeFileSync(PROJECTION_PATH, JSON.stringify(doc, null, 2) + "\n");
console.log("wrote " + PROJECTION_PATH);
console.log("objects=" + objects.length + " relationships=" + relationships.length);
console.log("graphDigest=" + graphDigest);
