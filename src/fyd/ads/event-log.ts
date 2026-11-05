/**
 * Append-only per-entity event log for the FYD ads loop stores
 * (server-only). This is the owner-store persistence pattern
 * (src/fyd/object/owner-events.ts) carried into src/fyd/ads/ exactly as
 * DESIGN.md (BOOTSTRAP-SURGE-OBJECTS-LOOP-DESIGN-20261104) prescribes:
 *
 * - One JSON log file per entity under an env-overridable directory:
 *   data/fyd-ads/<subdir>/<entityId>.json holding
 *   { version: 1, entityKind, entityId, events: [...] }.
 * - Every event carries a content-hash identity (sha256 over canonical
 *   bytes via canonicalizeJson, the repo's existing canonicalization
 *   authority) with the generator version bound in, plus its seq.
 * - State is a pure projection over the log; this module only reads and
 *   appends. There is no update or delete path.
 * - Fail closed: a MISSING file yields []. A file that exists but is
 *   unreadable, unparseable, structurally invalid, or written for a
 *   different entity throws CorruptAdsLogError; missing and corrupt are
 *   never conflated, reads never write, and an append never overwrites
 *   an untrusted log.
 *
 * FYD_ADS_DIR env override exists so tests can use a temp directory.
 */

import { createHash } from "node:crypto";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { canonicalizeJson } from "../../lib/ping/dev-signer";

/** Generator bound into every ads event ID (identity namespace). */
export const FYD_ADS_GENERATOR = "fyd-ads@1";

const LOG_VERSION = 1;

export class AdsStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdsStoreError";
  }
}

/**
 * Typed failure for an ads log that exists but cannot be trusted. The
 * bytes are retained on disk; callers must refuse mutation and surface
 * this instead of projecting empty state. Code ADS_LOG_CORRUPT.
 */
export class CorruptAdsLogError extends Error {
  readonly code = "ADS_LOG_CORRUPT" as const;
  readonly entityKind: string;
  readonly entityId: string;
  readonly logPath: string;
  readonly reason: string;
  constructor(entityKind: string, entityId: string, logPath: string, reason: string) {
    super(
      "Ads log for " + entityKind + " " + entityId + " is corrupt (" + reason +
        "); bytes retained at " + logPath + ".",
    );
    this.name = "CorruptAdsLogError";
    this.entityKind = entityKind;
    this.entityId = entityId;
    this.logPath = logPath;
    this.reason = reason;
  }
}

/**
 * Typed failure for a read or command scoped to a tenant other than the
 * entity's owner. Code ADS_TENANT_SCOPE.
 */
export class AdsTenantScopeError extends Error {
  readonly code = "ADS_TENANT_SCOPE" as const;
  constructor(entityKind: string, entityId: string, tenantScope: string) {
    super(
      entityKind + " " + entityId + " is not visible to tenant scope " +
        JSON.stringify(tenantScope) + ".",
    );
    this.name = "AdsTenantScopeError";
  }
}

export interface AdsEvent {
  /** Content-hash identity (adsEventId over the body + seq). */
  id: string;
  /** Position in this entity's log. Assigned at append; part of the ID. */
  seq: number;
  /** ISO timestamp of the transition. */
  at: string;
  /** Event type within the owning store's vocabulary. */
  type: string;
  /** Event payload; shapes are owned and validated by each store. */
  payload: Record<string, unknown>;
}

/** Everything except the store-assigned identity fields. */
export type AdsEventDraft = Omit<AdsEvent, "id" | "seq">;

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/** Entity ids become file names; anything else fails closed. */
export function assertAdsEntityId(kindLabel: string, value: unknown): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new AdsStoreError("Invalid " + kindLabel + " id.");
  }
  return value;
}

export function requireText(kindLabel: string, value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AdsStoreError("Missing or empty " + kindLabel + ".");
  }
  return value;
}

export function adsDir(): string {
  const override = process.env.FYD_ADS_DIR;
  if (override) return override;
  return join(process.cwd(), "data", "fyd-ads");
}

function logPath(subdir: string, entityId: string): string {
  return join(adsDir(), subdir, entityId + ".json");
}

interface AdsLogFile {
  version: typeof LOG_VERSION;
  entityKind: string;
  entityId: string;
  events: AdsEvent[];
}

function isValidEvent(v: unknown): v is AdsEvent {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    typeof r.seq === "number" &&
    Number.isInteger(r.seq) &&
    (r.seq as number) >= 0 &&
    typeof r.at === "string" &&
    typeof r.type === "string" &&
    typeof r.payload === "object" &&
    r.payload !== null &&
    !Array.isArray(r.payload)
  );
}

function isValidLogFile(v: unknown): v is AdsLogFile {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    r.version === LOG_VERSION &&
    typeof r.entityKind === "string" &&
    typeof r.entityId === "string" &&
    Array.isArray(r.events) &&
    r.events.every(isValidEvent)
  );
}

/**
 * Deterministic content-hash identity for an ads event: canonical bytes
 * of the body (including seq, excluding id) with the entity identity
 * and generator version bound in. The same logical event appended at
 * the same position in the same entity's log always yields the same ID.
 */
export function adsEventId(
  entityKind: string,
  entityId: string,
  body: Omit<AdsEvent, "id">,
): string {
  const bytes = canonicalizeJson({
    ...body,
    entityKind,
    entityId,
    generator_version: FYD_ADS_GENERATOR,
  });
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

/**
 * Read one entity's event log. A MISSING file yields []. A file that
 * exists but is unreadable, unparseable, structurally invalid, or
 * written for a different entity throws CorruptAdsLogError. Reads never
 * write.
 */
export function readAdsEvents(
  subdir: string,
  entityKind: string,
  entityId: string,
): AdsEvent[] {
  assertAdsEntityId(entityKind, entityId);
  const path = logPath(subdir, entityId);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw new CorruptAdsLogError(entityKind, entityId, path, "unreadable file");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CorruptAdsLogError(entityKind, entityId, path, "invalid JSON");
  }
  if (!isValidLogFile(parsed)) {
    throw new CorruptAdsLogError(entityKind, entityId, path, "invalid log structure");
  }
  if (parsed.entityId !== entityId || parsed.entityKind !== entityKind) {
    throw new CorruptAdsLogError(entityKind, entityId, path, "entity mismatch");
  }
  return [...parsed.events].sort((a, b) => a.seq - b.seq);
}

function writeLogFile(
  subdir: string,
  entityKind: string,
  entityId: string,
  events: AdsEvent[],
): void {
  const path = logPath(subdir, entityId);
  mkdirSync(dirname(path), { recursive: true });
  const file: AdsLogFile = { version: LOG_VERSION, entityKind, entityId, events };
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify(file, null, 2) + "\n", "utf8");
  // Atomic replace so a crash can never leave a half-written file.
  renameSync(tmp, path);
}

/**
 * Append one event draft to an entity's log. Assigns seq, computes the
 * content-hash ID, and persists the whole log atomically. Validation
 * failures throw before anything is written. A corrupt existing log
 * throws CorruptAdsLogError and its bytes are retained.
 */
export function appendAdsEvent(
  subdir: string,
  entityKind: string,
  entityId: string,
  draft: AdsEventDraft,
): AdsEvent {
  assertAdsEntityId(entityKind, entityId);
  if (typeof draft.type !== "string" || draft.type.trim().length === 0) {
    throw new AdsStoreError("Invalid ads event type.");
  }
  if (typeof draft.at !== "string" || Number.isNaN(Date.parse(draft.at))) {
    throw new AdsStoreError("Invalid ads event timestamp.");
  }
  if (
    typeof draft.payload !== "object" ||
    draft.payload === null ||
    Array.isArray(draft.payload)
  ) {
    throw new AdsStoreError("Invalid ads event payload.");
  }
  const current = readAdsEvents(subdir, entityKind, entityId);
  const body: Omit<AdsEvent, "id"> = { ...draft, seq: current.length };
  const event: AdsEvent = { ...body, id: adsEventId(entityKind, entityId, body) };
  writeLogFile(subdir, entityKind, entityId, [...current, event]);
  return event;
}

/** Entity ids with a log in a subdir, sorted; a missing subdir yields []. */
export function listAdsEntityIds(subdir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(join(adsDir(), subdir));
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw err;
  }
  return names
    .filter((n) => n.endsWith(".json"))
    .map((n) => n.slice(0, -".json".length))
    .filter((n) => ID_PATTERN.test(n))
    .sort();
}
