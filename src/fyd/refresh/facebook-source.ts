/**
 * Facebook second-source adapter for the FYD refresh lane.
 *
 * Tonight's finding (2026-09-21, checked by the temporal-refresh agent):
 * authorized Facebook data for this entity is genuinely unavailable:
 *  - the website publishes no facebook.com link (outbound link scan of the
 *    fetched homepage found none),
 *  - an authorized social.search sweep for "Happy Place Carpentry" on
 *    Facebook surfaced only unrelated "happy place" woodworking content,
 *  - facebook-cli is not installed on the Pig, and on the sandbox side its
 *    profile/timeline reads require a page or profile ID obtained from
 *    earlier authorized output; no such ID exists for this business.
 *
 * The adapter below encodes that availability check, keeps the real ingest
 * path wired (fromFacebookCliJson) for the day an authorized ID exists, and
 * provides a clearly-labeled synthetic fixture so the conflict machinery can
 * be proved tonight without fabricating real-world data.
 */

import { createHash } from "node:crypto";
import { normalizeClaimValue } from "./types.ts";
import type { Claim, Observation, SourceKind } from "./types.ts";

export interface FacebookAvailability {
  available: boolean;
  checkedAt: string;
  methodsTried: string[];
  reason: string;
}

export function checkFacebookAvailability(checkedAt: string): FacebookAvailability {
  return {
    available: false,
    checkedAt,
    methodsTried: [
      "website outbound link scan of the fetched homepage for facebook.com (none found)",
      "authorized social.search sweep for 'Happy Place Carpentry' on Facebook, Corvallis OR (no business page surfaced; only unrelated 'happy place' woodworking content)",
      "facebook-cli availability on the Pig (not installed); sandbox-side reads require a page/profile ID from prior authorized output, which does not exist for this business",
    ],
    reason:
      "No authorized Facebook page or profile for this entity is reachable " +
      "through the authorized read paths. The website publishes no Facebook " +
      "link and no public business page surfaced. Conflict machinery is " +
      "proved tonight on a labeled synthetic fixture instead.",
  };
}

function syntheticClaimId(entityId: string, field: string, normalized: string): string {
  return "syn-" + createHash("sha256")
    .update(entityId + "|" + field + "|facebook|" + normalized)
    .digest("hex")
    .slice(0, 12);
}

function fbClaim(
  entityId: string,
  field: string,
  value: string,
  observedAt: string,
  confidence: number,
): Claim {
  const normalized = normalizeClaimValue(value);
  return {
    claimId: syntheticClaimId(entityId, field, normalized),
    entityId,
    field,
    value,
    normalizedValue: normalized,
    sourceKind: "facebook",
    sourceUrl: "https://www.facebook.com/ (no business page found; synthetic fixture)",
    observedAt,
    evidenceRef: "src/fyd/refresh/facebook-source.ts :: syntheticFacebookObservation (labeled synthetic fixture)",
    confidence,
    grade: "synthetic_fixture",
    label: "synthetic-conflict-fixture",
  };
}

/**
 * Controlled synthetic Facebook observation, CLEARLY LABELED. It agrees with
 * the website on name and phone (so entity resolution still matches) and
 * disagrees on weekday hours and description wording (so conflict detection
 * has something real to chew on). Never presented as genuine Facebook data.
 */
export function syntheticFacebookObservation(
  entityId: string,
  observedAt: string,
): Observation {
  const claims: Claim[] = [
    fbClaim(entityId, "name", "Happy Place Carpentry", observedAt, 0.5),
    fbClaim(
      entityId,
      "description",
      "Decks, fences, and remodels in the Willamette Valley.",
      observedAt,
      0.5,
    ),
    fbClaim(entityId, "hours", "Mon-Fri 9am-5pm", observedAt, 0.5),
    fbClaim(entityId, "phone", "541-286-5190", observedAt, 0.5),
  ];
  return {
    observationId: "obs-facebook-synthetic-" + observedAt.replace(/[:.]/g, "-"),
    observedAt,
    sourceKind: "facebook",
    sourceUrl: "https://www.facebook.com/ (no business page found; synthetic fixture)",
    evidenceRef: "src/fyd/refresh/facebook-source.ts :: syntheticFacebookObservation",
    provenance: "synthetic",
    claims,
  };
}

/**
 * Real ingest path, kept wired for the day an authorized Facebook page ID
 * exists. Accepts the parsed JSON of an authorized facebook-cli read
 * (profile info or page read) and emits provider_statement claims. Not fed
 * any data tonight; availability is false.
 */
export function fromFacebookCliJson(
  raw: {
    pageUrl: string;
    name?: string;
    about?: string;
    hours?: string;
    phone?: string;
    observedAt: string;
    evidenceRef: string;
  },
  entityId: string,
): Observation {
  const claims: Claim[] = [];
  const push = (field: string, value: string | undefined, confidence: number) => {
    if (!value) return;
    const normalized = normalizeClaimValue(value);
    claims.push({
      claimId: createHash("sha256")
        .update(entityId + "|" + field + "|facebook|" + normalized)
        .digest("hex")
        .slice(0, 16),
      entityId,
      field,
      value,
      normalizedValue: normalized,
      sourceKind: "facebook" as SourceKind,
      sourceUrl: raw.pageUrl,
      observedAt: raw.observedAt,
      evidenceRef: raw.evidenceRef,
      confidence,
      grade: "provider_statement",
      label: "facebook-real",
    });
  };
  push("name", raw.name, 0.9);
  push("description", raw.about, 0.85);
  push("hours", raw.hours, 0.85);
  push("phone", raw.phone, 0.85);
  return {
    observationId: "obs-facebook-" + raw.observedAt.replace(/[:.]/g, "-"),
    observedAt: raw.observedAt,
    sourceKind: "facebook",
    sourceUrl: raw.pageUrl,
    evidenceRef: raw.evidenceRef,
    provenance: "real",
    claims,
  };
}
