/**
 * Assessment request store (2026-10-20, PING-WEBSITE-IMPROVE F1b).
 *
 * The durable, private store for practical technology and operations
 * assessment requests from /assessment. A second form type on the SAME
 * storage discipline as the featured application store
 * (./featured-application-store.ts) and the inquiry store before it:
 *
 *   - tenant-private storage: one atomic JSON file per site scope
 *     (temp file + rename), never rendered into a visitor projection.
 *   - opaque protected receipt ids ("ar-" + 32 hex) and request refs
 *     ("areq-" + 32 hex); the receipt carries NO contact details.
 *   - content dedupe: a repeat submission with the same normalized
 *     business name + best contact detail REPLAYS the stored receipt
 *     instead of creating a second record.
 *   - load never throws: a missing or corrupt file loads as empty.
 *
 * Server-side only (file I/O). No network, no email, no messages.
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tenantScopedDir } from "../tenant/tenant-context";

const STORE_VERSION = 1 as const;

/** The site scope assessment requests belong to: PING's own tenant. */
export const ASSESSMENT_REQUEST_SITE_ID = "ping-fyd";

export type AssessmentContactChannel = "facebook" | "phone" | "email";

export interface AssessmentRequestRecord {
  receiptId: string; // "ar-" + 32 hex
  requestRef: string; // "areq-" + 32 hex
  /** sha256 of the normalized dedupe key. Never a raw contact detail. */
  dedupeKey: string;
  businessName: string;
  contactName: string;
  contactChannel: AssessmentContactChannel;
  /** PRIVATE: stored only here, never in a receipt or projection. */
  contactDetail: string;
  businessType: string;
  serviceArea: string;
  stuck: string;
  permissionFollowUp: boolean;
  receivedAt: string;
}

/** The durable receipt: proof of acceptance, NO contact details. */
export interface AssessmentRequestReceipt {
  receiptId: string;
  requestRef: string;
  businessName: string;
  receivedAt: string;
}

export function makeAssessmentRequestRefs(): {
  requestRef: string;
  receiptId: string;
} {
  return {
    requestRef: "areq-" + randomBytes(16).toString("hex"),
    receiptId: "ar-" + randomBytes(16).toString("hex"),
  };
}

function normalizeKeyPart(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, " ");
}

export function assessmentRequestDedupeKey(
  businessName: string,
  contactDetail: string,
): string {
  return createHash("sha256")
    .update(
      "assessment-request:" +
        normalizeKeyPart(businessName) +
        "|" +
        normalizeKeyPart(contactDetail),
      "utf8",
    )
    .digest("hex");
}

export function assessmentRequestPrivateBaseDir(): string {
  const override = process.env.FYD_ASSESSMENT_REQUEST_PRIVATE_DIR;
  if (override) return override;
  return join(process.cwd(), "data", "fyd-assessment-requests-private");
}

export function assessmentRequestStorePath(baseDir?: string): string {
  return join(
    tenantScopedDir(
      baseDir ?? assessmentRequestPrivateBaseDir(),
      ASSESSMENT_REQUEST_SITE_ID,
    ),
    "requests.json",
  );
}

export interface AssessmentRequestStoreFile {
  version: typeof STORE_VERSION;
  siteId: string;
  requests: AssessmentRequestRecord[];
}

function emptyStore(): AssessmentRequestStoreFile {
  return {
    version: STORE_VERSION,
    siteId: ASSESSMENT_REQUEST_SITE_ID,
    requests: [],
  };
}

function isRecord(v: unknown): v is AssessmentRequestRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.receiptId === "string" &&
    typeof r.requestRef === "string" &&
    typeof r.dedupeKey === "string" &&
    typeof r.businessName === "string" &&
    typeof r.contactName === "string" &&
    typeof r.contactDetail === "string" &&
    typeof r.businessType === "string" &&
    typeof r.serviceArea === "string" &&
    typeof r.stuck === "string" &&
    typeof r.receivedAt === "string"
  );
}

function isStoreFile(v: unknown): v is AssessmentRequestStoreFile {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    r.version === STORE_VERSION &&
    r.siteId === ASSESSMENT_REQUEST_SITE_ID &&
    Array.isArray(r.requests) &&
    r.requests.every(isRecord)
  );
}

/** Load the store. Never throws: missing or corrupt loads as empty. */
export function loadAssessmentRequestStore(
  baseDir?: string,
): AssessmentRequestStoreFile {
  try {
    const raw = readFileSync(assessmentRequestStorePath(baseDir), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (isStoreFile(parsed)) return parsed;
    return emptyStore();
  } catch {
    return emptyStore();
  }
}

/** Resolve a stored record by its dedupe key (replay, not re-mutation). */
export function findAssessmentRequestByDedupeKey(
  dedupeKey: string,
  baseDir?: string,
): AssessmentRequestRecord | null {
  const store = loadAssessmentRequestStore(baseDir);
  return store.requests.find((r) => r.dedupeKey === dedupeKey) ?? null;
}

/**
 * Persist one request record atomically (temp file + rename). Throws on
 * failure: the route treats a store write failure as a failed admission
 * and issues NO receipt.
 */
export function saveAssessmentRequestRecord(
  record: AssessmentRequestRecord,
  baseDir?: string,
): void {
  const file = assessmentRequestStorePath(baseDir);
  const dir = file.slice(0, file.lastIndexOf("/"));
  const store = loadAssessmentRequestStore(baseDir);
  if (store.requests.some((r) => r.receiptId === record.receiptId)) {
    throw new Error(
      "Refusing to store a duplicate assessment request receipt id: " +
        "replay must resolve, never re-store.",
    );
  }
  if (store.requests.some((r) => r.dedupeKey === record.dedupeKey)) {
    throw new Error(
      "Refusing to store a duplicate assessment request dedupe key: " +
        "replay must resolve, never re-store.",
    );
  }
  const next: AssessmentRequestStoreFile = {
    version: STORE_VERSION,
    siteId: ASSESSMENT_REQUEST_SITE_ID,
    requests: [...store.requests, record],
  };
  const tmp = file + ".tmp";
  mkdirSync(dir, { recursive: true });
  writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n", "utf8");
  renameSync(tmp, file);
}

/** The receipt view of a stored record: proof of acceptance, no PII. */
export function assessmentReceiptForRecord(
  record: AssessmentRequestRecord,
): AssessmentRequestReceipt {
  return {
    receiptId: record.receiptId,
    requestRef: record.requestRef,
    businessName: record.businessName,
    receivedAt: record.receivedAt,
  };
}
