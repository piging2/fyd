/**
 * Placement-decision store for the FYD objects economic loop (lane
 * B3; DESIGN.md, BOOTSTRAP-SURGE-OBJECTS-LOOP-DESIGN-20261104).
 *
 * The audit record behind every composition the matching provider
 * returns: one JSON object per evaluation at
 * data/fyd-ads/decisions/<decisionId>.json (env FYD_ADS_DIR). The
 * on-disk shape is the canonical shape the event ledger (lane B2)
 * reads for its decision-coverage check, field for field:
 * decisionId, evaluatedAt (epoch ms), surface, slotId, campaignId,
 * and evaluation: { eligible, ... }. Decisions are recorded so any
 * rendered placement can be traced to the exact inputs that allowed
 * it; the branded eligible projection itself is never persisted as
 * authority (per the rank README), only its digest.
 *
 * Persistence follows the owner-store pattern's guarantees in the
 * byte shape B2 defines: one file per entity under the
 * env-overridable ads dir, atomic tmp+rename writes, and immutable
 * records. Rewriting a decisionId with byte-identical content is a
 * no-op (deterministic re-evaluation); rewriting it with different
 * content throws, because a decision, once recorded, is history.
 * Reads fail closed: a missing record yields null; an unparseable
 * or structurally invalid file throws CorruptAdsLogError and its
 * bytes are retained.
 */

import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { canonicalBytes } from "../ask/envelope";
import type {
  ObjectExposureWindow,
  PlacementAuthoritySnapshot,
} from "../rank/sponsored-placement";
import {
  AdsStoreError,
  CorruptAdsLogError,
  adsDir,
} from "./event-log";

export const DECISION_ENTITY_KIND = "decision";
const DECISIONS_SUBDIR = "decisions";

export type PlacementDecisionEvaluation =
  | { eligible: true; projectionDigest: string }
  | {
      eligible: false;
      /** The evaluator's named rejection, a loop-level gate name, or "provider-error". */
      reason: string;
      /** Error class name when reason is "provider-error". */
      failureClass?: string;
      /** Typed error code when the failure carried one. */
      failureCode?: string;
    };

export interface PlacementDecisionRecord {
  decisionId: string;
  /** Epoch ms of the evaluation (the B2 coverage window opens here). */
  evaluatedAt: number;
  surface: string;
  /** Null only on assembly-level provider-error records. */
  slotId: string | null;
  /** Null only on assembly-level provider-error records. */
  campaignId: string | null;
  publisherTenantId: string;
  payerId: string | null;
  /** The authority snapshot exactly as constructed; null on provider-error. */
  authoritySnapshot: PlacementAuthoritySnapshot | null;
  /** The exposure window exactly as read; null when none was read. */
  exposureWindow: ObjectExposureWindow | null;
  /** sha256 over the canonical bytes of every input to the evaluation. */
  inputsDigest: string;
  evaluation: PlacementDecisionEvaluation;
  /** Whether the evaluated placement reached the returned composition. */
  composition?: { included: boolean; reason?: string };
}

const DECISION_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function decisionPath(decisionId: string): string {
  return join(adsDir(), DECISIONS_SUBDIR, decisionId + ".json");
}

/** sha256 over the envelope kit's canonical bytes; the loop's one digest. */
export function adsDigest(value: unknown): string {
  return createHash("sha256").update(canonicalBytes(value), "utf8").digest("hex");
}

/**
 * Deterministic decision identity: identical inputs at the same
 * evaluation instant mint the identical decisionId, so a repeated
 * evaluation rewrites the identical record (a no-op) instead of
 * forking history.
 */
export function mintPlacementDecisionId(parts: {
  slotId: string | null;
  campaignId: string | null;
  surface: string;
  evaluatedAt: number;
  inputsDigest: string;
}): string {
  return "decision-" + adsDigest(parts);
}

function assertRecordShape(record: PlacementDecisionRecord): void {
  if (!DECISION_ID_PATTERN.test(record.decisionId)) {
    throw new AdsStoreError("Invalid decisionId: " + JSON.stringify(record.decisionId));
  }
  if (!Number.isFinite(record.evaluatedAt)) {
    throw new AdsStoreError("Decision evaluatedAt must be finite epoch ms.");
  }
  if (typeof record.surface !== "string" || record.surface.trim().length === 0) {
    throw new AdsStoreError("Decision surface must be non-empty text.");
  }
  if (
    typeof record.evaluation !== "object" ||
    record.evaluation === null ||
    typeof record.evaluation.eligible !== "boolean"
  ) {
    throw new AdsStoreError("Decision evaluation must carry an eligible flag.");
  }
}

/**
 * Persist one decision record atomically. Byte-identical rewrites
 * are no-ops; different bytes under an existing decisionId throw
 * AdsStoreError (decisions are immutable). Returns the record.
 */
export function writePlacementDecision(
  record: PlacementDecisionRecord,
): PlacementDecisionRecord {
  assertRecordShape(record);
  const path = decisionPath(record.decisionId);
  const bytes = JSON.stringify(record, null, 2) + "\n";
  let existing: string | null = null;
  try {
    existing = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      throw new CorruptAdsLogError(
        DECISION_ENTITY_KIND,
        record.decisionId,
        path,
        "unreadable existing decision record",
      );
    }
  }
  if (existing !== null) {
    if (existing === bytes) return record;
    throw new AdsStoreError(
      "Placement decision is immutable and already recorded differently: " +
        record.decisionId,
    );
  }
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + ".tmp";
  writeFileSync(tmp, bytes, "utf8");
  renameSync(tmp, path);
  return record;
}

function isValidDecisionRecord(v: unknown): v is PlacementDecisionRecord {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  const ev = r.evaluation as Record<string, unknown> | null;
  return (
    typeof r.decisionId === "string" &&
    DECISION_ID_PATTERN.test(r.decisionId) &&
    typeof r.evaluatedAt === "number" &&
    Number.isFinite(r.evaluatedAt) &&
    typeof r.surface === "string" &&
    (typeof r.slotId === "string" || r.slotId === null) &&
    (typeof r.campaignId === "string" || r.campaignId === null) &&
    typeof ev === "object" &&
    ev !== null &&
    typeof ev.eligible === "boolean"
  );
}

/**
 * Read one decision record. Missing yields null; a file that exists
 * but cannot be trusted throws CorruptAdsLogError (fail closed).
 */
export function readPlacementDecision(
  decisionId: string,
): PlacementDecisionRecord | null {
  if (!DECISION_ID_PATTERN.test(decisionId)) {
    throw new AdsStoreError("Invalid decisionId: " + JSON.stringify(decisionId));
  }
  const path = decisionPath(decisionId);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw new CorruptAdsLogError(DECISION_ENTITY_KIND, decisionId, path, "unreadable file");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CorruptAdsLogError(DECISION_ENTITY_KIND, decisionId, path, "invalid JSON");
  }
  if (!isValidDecisionRecord(parsed) || parsed.decisionId !== decisionId) {
    throw new CorruptAdsLogError(
      DECISION_ENTITY_KIND,
      decisionId,
      path,
      "invalid decision record structure",
    );
  }
  return parsed;
}

/** All recorded decision ids, sorted; a missing directory yields []. */
export function listPlacementDecisionIds(): string[] {
  let names: string[];
  try {
    names = readdirSync(join(adsDir(), DECISIONS_SUBDIR));
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw err;
  }
  return names
    .filter((n) => n.endsWith(".json"))
    .map((n) => n.slice(0, -".json".length))
    .filter((n) => DECISION_ID_PATTERN.test(n))
    .sort();
}
