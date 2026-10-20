/**
 * Nomination store (2026-10-20, PING-WEBSITE-IMPROVE steering 3).
 *
 * The durable, private store for "Nominate a business for a PING
 * feature" submissions from /nominate. A third form type on the SAME
 * storage discipline as the featured application and assessment
 * stores (and the inquiry store before them):
 *
 *   - tenant-private storage: one atomic JSON file per site scope
 *     (temp file + rename), never rendered into a visitor projection.
 *   - opaque protected receipt ids ("nm-" + 32 hex) and nomination
 *     refs ("nom-" + 32 hex); the receipt carries NO contact details.
 *   - every nomination is a countable record. Records carry a
 *     businessKey: the sha256 of the normalized business identity
 *     (business name plus city or service area). Applications and
 *     nominations for the same business share that identity shape,
 *     which is what a future voting mechanic attaches to.
 *   - dedupe is per nominator, never per business: a repeat by the
 *     SAME nominator (same normalized contact, or same name when no
 *     contact was given) for the same business replays the stored
 *     receipt instead of double counting one person. Different
 *     nominators nominating the same business create distinct
 *     countable records with the same businessKey. A nomination with
 *     no nominator identity at all is always a new countable record.
 *   - load never throws: a missing or corrupt file loads as empty.
 *
 * Nominations are counted privately by PING. Nothing about a business
 * is published from this store without that business's own consent.
 *
 * Server-side only (file I/O). No network, no email, no messages.
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tenantScopedDir } from "../tenant/tenant-context";

const STORE_VERSION = 1 as const;

/** The site scope nominations belong to: PING's own tenant. */
export const NOMINATION_SITE_ID = "ping-fyd";

/** The audience category, in the site's current public language. */
export type NominationCategory = "skilled" | "knowledge";

export interface NominationRecord {
  receiptId: string; // "nm-" + 32 hex
  nominationRef: string; // "nom-" + 32 hex
  /** sha256 of normalized business name + city: the business identity. */
  businessKey: string;
  /**
   * sha256 dedupe key for THIS nominator and business, or null when the
   * nomination carries no nominator identity (always countable).
   */
  dedupeKey: string | null;
  businessName: string;
  category: NominationCategory;
  city: string;
  exceptional: string;
  nominatorName: string;
  /** PRIVATE: stored only here, never in a receipt or projection. */
  nominatorContact: string;
  permissionFollowUp: boolean;
  receivedAt: string;
}

/** The durable receipt: proof of acceptance, NO contact details. */
export interface NominationReceipt {
  receiptId: string;
  nominationRef: string;
  businessName: string;
  receivedAt: string;
}

export function makeNominationRefs(): {
  nominationRef: string;
  receiptId: string;
} {
  return {
    nominationRef: "nom-" + randomBytes(16).toString("hex"),
    receiptId: "nm-" + randomBytes(16).toString("hex"),
  };
}

function normalizeKeyPart(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, " ");
}

/** The normalized business identity a future voting mechanic keys on. */
export function nominationBusinessKey(
  businessName: string,
  city: string,
): string {
  return createHash("sha256")
    .update(
      "business:" + normalizeKeyPart(businessName) + "|" + normalizeKeyPart(city),
      "utf8",
    )
    .digest("hex");
}

/**
 * The per-nominator dedupe key, or null when the nomination carries no
 * nominator identity (anonymous nominations always count).
 */
export function nominationDedupeKey(
  businessKey: string,
  nominatorContact: string,
  nominatorName: string,
): string | null {
  const identity = normalizeKeyPart(nominatorContact || nominatorName);
  if (!identity) return null;
  return createHash("sha256")
    .update("nomination:" + businessKey + "|" + identity, "utf8")
    .digest("hex");
}

export function nominationPrivateBaseDir(): string {
  const override = process.env.FYD_NOMINATION_PRIVATE_DIR;
  if (override) return override;
  return join(process.cwd(), "data", "fyd-nominations-private");
}

export function nominationStorePath(baseDir?: string): string {
  return join(
    tenantScopedDir(baseDir ?? nominationPrivateBaseDir(), NOMINATION_SITE_ID),
    "nominations.json",
  );
}

export interface NominationStoreFile {
  version: typeof STORE_VERSION;
  siteId: string;
  nominations: NominationRecord[];
}

function emptyStore(): NominationStoreFile {
  return { version: STORE_VERSION, siteId: NOMINATION_SITE_ID, nominations: [] };
}

function isRecord(v: unknown): v is NominationRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.receiptId === "string" &&
    typeof r.nominationRef === "string" &&
    typeof r.businessKey === "string" &&
    typeof r.businessName === "string" &&
    (r.category === "skilled" || r.category === "knowledge") &&
    typeof r.city === "string" &&
    typeof r.exceptional === "string" &&
    typeof r.receivedAt === "string"
  );
}

function isStoreFile(v: unknown): v is NominationStoreFile {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    r.version === STORE_VERSION &&
    r.siteId === NOMINATION_SITE_ID &&
    Array.isArray(r.nominations) &&
    r.nominations.every(isRecord)
  );
}

/** Load the store. Never throws: missing or corrupt loads as empty. */
export function loadNominationStore(baseDir?: string): NominationStoreFile {
  try {
    const raw = readFileSync(nominationStorePath(baseDir), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (isStoreFile(parsed)) return parsed;
    return emptyStore();
  } catch {
    return emptyStore();
  }
}

/** Resolve a stored record by its dedupe key (replay, not re-mutation). */
export function findNominationByDedupeKey(
  dedupeKey: string,
  baseDir?: string,
): NominationRecord | null {
  const store = loadNominationStore(baseDir);
  return store.nominations.find((n) => n.dedupeKey === dedupeKey) ?? null;
}

/**
 * Persist one nomination record atomically (temp file + rename).
 * Throws on failure: the route treats a store write failure as a
 * failed admission and issues NO receipt.
 */
export function saveNominationRecord(
  record: NominationRecord,
  baseDir?: string,
): void {
  const file = nominationStorePath(baseDir);
  const dir = file.slice(0, file.lastIndexOf("/"));
  const store = loadNominationStore(baseDir);
  if (store.nominations.some((n) => n.receiptId === record.receiptId)) {
    throw new Error(
      "Refusing to store a duplicate nomination receipt id: " +
        "replay must resolve, never re-store.",
    );
  }
  if (
    record.dedupeKey !== null &&
    store.nominations.some((n) => n.dedupeKey === record.dedupeKey)
  ) {
    throw new Error(
      "Refusing to store a duplicate nomination dedupe key: " +
        "replay must resolve, never re-store.",
    );
  }
  const next: NominationStoreFile = {
    version: STORE_VERSION,
    siteId: NOMINATION_SITE_ID,
    nominations: [...store.nominations, record],
  };
  const tmp = file + ".tmp";
  mkdirSync(dir, { recursive: true });
  writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n", "utf8");
  renameSync(tmp, file);
}

/** The receipt view of a stored record: proof of acceptance, no PII. */
export function nominationReceiptForRecord(
  record: NominationRecord,
): NominationReceipt {
  return {
    receiptId: record.receiptId,
    nominationRef: record.nominationRef,
    businessName: record.businessName,
    receivedAt: record.receivedAt,
  };
}
