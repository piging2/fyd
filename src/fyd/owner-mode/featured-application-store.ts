/**
 * Featured application store (2026-10-20, PING-WEBSITE-IMPROVE F1).
 *
 * The durable, private store for "Apply to be considered for a feature"
 * submissions from /apply. It follows the proven inquiry pattern in
 * ./inquiry-store.ts as faithfully as the different payload allows:
 *
 *   - tenant-private storage: one atomic JSON file per site scope
 *     (temp file + rename), never in the public journal, never rendered
 *     into any visitor projection.
 *   - opaque protected receipt ids ("fa-" + 32 hex) and application
 *     refs ("fapp-" + 32 hex); the receipt carries NO contact details.
 *   - content dedupe: a repeat submission with the same normalized
 *     business name + best contact detail REPLAYS the stored receipt
 *     instead of creating a second record (the same normalized-key
 *     discipline the inquiry intake applies with its idempotency keys
 *     and sender hash in ./inquiry-store.ts).
 *   - load never throws: a missing or corrupt file loads as empty, so a
 *     bad store can never corrupt the intake.
 *
 * Server-side only (file I/O). No network, no email, no messages.
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tenantScopedDir } from "../tenant/tenant-context";

const STORE_VERSION = 1 as const;

/** The site scope featured applications belong to: PING's own tenant. */
export const FEATURED_APPLICATION_SITE_ID = "ping-fyd";

/** The collar split: the two featured groups are the destination. */
export type FeaturedCollar = "blue" | "white";

export type FeaturedContactChannel = "facebook" | "phone" | "email";

export interface FeaturedApplicationRecord {
  receiptId: string; // "fa-" + 32 hex
  applicationRef: string; // "fapp-" + 32 hex
  /** sha256 of the normalized dedupe key. Never a raw contact detail. */
  dedupeKey: string;
  businessName: string;
  collar: FeaturedCollar;
  trade: string;
  contactName: string;
  serviceArea: string;
  website: string;
  socialLinks: string;
  exceptional: string;
  portfolioLink: string;
  contactChannel: FeaturedContactChannel;
  /** PRIVATE: stored only here, never in a receipt or projection. */
  contactDetail: string;
  permissionFollowUp: boolean;
  receivedAt: string;
}

/**
 * The durable receipt returned to the applicant. Deliberately carries NO
 * contact details: it is proof of acceptance, not a copy of the intake.
 * Same shape discipline as InquiryReceipt in ./inquiry-store.ts.
 */
export interface FeaturedApplicationReceipt {
  receiptId: string;
  applicationRef: string;
  businessName: string;
  receivedAt: string;
}

export function makeFeaturedApplicationRefs(): {
  applicationRef: string;
  receiptId: string;
} {
  return {
    applicationRef: "fapp-" + randomBytes(16).toString("hex"),
    receiptId: "fa-" + randomBytes(16).toString("hex"),
  };
}

function normalizeKeyPart(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * The dedupe key: normalized business name plus normalized best contact
 * detail, hashed. Mirrors inquirySenderKey's "hash, never the raw
 * contact" rule.
 */
export function featuredApplicationDedupeKey(
  businessName: string,
  contactDetail: string,
): string {
  return createHash("sha256")
    .update(
      "featured-application:" +
        normalizeKeyPart(businessName) +
        "|" +
        normalizeKeyPart(contactDetail),
      "utf8",
    )
    .digest("hex");
}

export function featuredApplicationPrivateBaseDir(): string {
  const override = process.env.FYD_FEATURED_APPLICATION_PRIVATE_DIR;
  if (override) return override;
  return join(process.cwd(), "data", "fyd-featured-applications-private");
}

export function featuredApplicationStorePath(baseDir?: string): string {
  return join(
    tenantScopedDir(
      baseDir ?? featuredApplicationPrivateBaseDir(),
      FEATURED_APPLICATION_SITE_ID,
    ),
    "applications.json",
  );
}

export interface FeaturedApplicationStoreFile {
  version: typeof STORE_VERSION;
  siteId: string;
  applications: FeaturedApplicationRecord[];
}

function emptyStore(): FeaturedApplicationStoreFile {
  return {
    version: STORE_VERSION,
    siteId: FEATURED_APPLICATION_SITE_ID,
    applications: [],
  };
}

function isRecord(v: unknown): v is FeaturedApplicationRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.receiptId === "string" &&
    typeof r.applicationRef === "string" &&
    typeof r.dedupeKey === "string" &&
    typeof r.businessName === "string" &&
    (r.collar === "blue" || r.collar === "white") &&
    typeof r.trade === "string" &&
    typeof r.contactName === "string" &&
    typeof r.serviceArea === "string" &&
    typeof r.exceptional === "string" &&
    typeof r.contactDetail === "string" &&
    typeof r.receivedAt === "string"
  );
}

function isStoreFile(v: unknown): v is FeaturedApplicationStoreFile {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    r.version === STORE_VERSION &&
    r.siteId === FEATURED_APPLICATION_SITE_ID &&
    Array.isArray(r.applications) &&
    r.applications.every(isRecord)
  );
}

/** Load the store. Never throws: missing or corrupt loads as empty. */
export function loadFeaturedApplicationStore(
  baseDir?: string,
): FeaturedApplicationStoreFile {
  try {
    const raw = readFileSync(featuredApplicationStorePath(baseDir), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (isStoreFile(parsed)) return parsed;
    return emptyStore();
  } catch {
    return emptyStore();
  }
}

/** Resolve a stored record by its dedupe key (replay, not re-mutation). */
export function findFeaturedApplicationByDedupeKey(
  dedupeKey: string,
  baseDir?: string,
): FeaturedApplicationRecord | null {
  const store = loadFeaturedApplicationStore(baseDir);
  return store.applications.find((a) => a.dedupeKey === dedupeKey) ?? null;
}

/**
 * Persist one application record atomically (temp file + rename).
 * Throws on failure: the route treats a store write failure as a failed
 * admission and issues NO receipt.
 */
export function saveFeaturedApplicationRecord(
  record: FeaturedApplicationRecord,
  baseDir?: string,
): void {
  const file = featuredApplicationStorePath(baseDir);
  const dir = file.slice(0, file.lastIndexOf("/"));
  const store = loadFeaturedApplicationStore(baseDir);
  if (store.applications.some((a) => a.receiptId === record.receiptId)) {
    throw new Error(
      "Refusing to store a duplicate featured application receipt id: " +
        "replay must resolve, never re-store.",
    );
  }
  if (store.applications.some((a) => a.dedupeKey === record.dedupeKey)) {
    throw new Error(
      "Refusing to store a duplicate featured application dedupe key: " +
        "replay must resolve, never re-store.",
    );
  }
  const next: FeaturedApplicationStoreFile = {
    version: STORE_VERSION,
    siteId: FEATURED_APPLICATION_SITE_ID,
    applications: [...store.applications, record],
  };
  const tmp = file + ".tmp";
  mkdirSync(dir, { recursive: true });
  writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n", "utf8");
  renameSync(tmp, file);
}

/** The receipt view of a stored record: proof of acceptance, no PII. */
export function featuredReceiptForRecord(
  record: FeaturedApplicationRecord,
): FeaturedApplicationReceipt {
  return {
    receiptId: record.receiptId,
    applicationRef: record.applicationRef,
    businessName: record.businessName,
    receivedAt: record.receivedAt,
  };
}
