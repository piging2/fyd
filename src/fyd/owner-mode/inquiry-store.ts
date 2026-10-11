/**
 * P2 (2026-10-11): the tenant-private inquiry store for quote requests.
 *
 * Harvest correction 3, binding: customer contact details and messages
 * live ONLY here, in a tenant-scoped directory. The public journal (the
 * owner event log) and every visitor-visible projection must NEVER see
 * them. The canonical event references the PROTECTED inquiry receipt
 * (an opaque ir-<hex> ref), never the contact details.
 *
 * Separation of layers, stated plainly:
 *   TENANT-PRIVATE   = this store: full InquiryRecord incl. name,
 *                      contact, message (owner inbox reads this).
 *   PUBLIC JOURNAL   = object/owner-events.ts: customer.inquiry-received
 *                      events with evidence.kind "inquiry-receipt" and
 *                      evidence.ref = the opaque receipt id. No PII.
 *   VISITOR VIEW     = projections composed from source facts + owner
 *                      events; must contain zero customer contact details.
 *
 * Server-side only (file I/O). No network, no email, no messages.
 */

import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tenantScopedDir } from "../tenant/tenant-context";

const STORE_VERSION = 1 as const;
const RATE_VERSION = 1 as const;

/** Opaque protected receipt id. Resolves only via this private store. */
export type InquiryReceiptId = string; // "ir-" + 32 hex
/** Opaque internal inquiry ref. */
export type InquiryRef = string; // "inq-" + 32 hex

/**
 * The durable tenant-private record. visitorName / visitorContact /
 * visitorMessage are PRIVATE: never serialized into a journal, an
 * event, or a visitor projection.
 */
export interface InquiryRecord {
  receiptId: InquiryReceiptId;
  inquiryRef: InquiryRef;
  siteId: string;
  serviceId: string;
  serviceLabel: string;
  visitorName: string;
  visitorContact: string;
  visitorMessage: string;
  receivedAt: string;
  /** The canonical customer.inquiry-received event id. */
  eventId: string;
  idempotencyKey: string | null;
}

/**
 * The durable receipt returned to the visitor. Deliberately carries NO
 * contact details: it is proof of acceptance, not a copy of the intake.
 */
export interface InquiryReceipt {
  receiptId: InquiryReceiptId;
  inquiryRef: InquiryRef;
  siteId: string;
  serviceId: string;
  serviceLabel: string;
  receivedAt: string;
  eventId: string;
}

/** Generate a fresh pair of opaque refs. No PII is derivable from them. */
export function makeInquiryRefs(): {
  inquiryRef: InquiryRef;
  receiptId: InquiryReceiptId;
} {
  return {
    inquiryRef: "inq-" + randomBytes(16).toString("hex"),
    receiptId: "ir-" + randomBytes(16).toString("hex"),
  };
}

/** The sender key for rate limiting: a hash, never the raw contact. */
export function inquirySenderKey(contact: string): string {
  return createHash("sha256")
    .update("inquiry-sender:" + contact.trim().toLowerCase(), "utf8")
    .digest("hex");
}

// ---------------------------------------------------------------------------
// Durable private store: one atomic JSON file per site.
// ---------------------------------------------------------------------------

export interface InquiryStoreFile {
  version: typeof STORE_VERSION;
  siteId: string;
  inquiries: InquiryRecord[];
}

export function inquiryPrivateBaseDir(): string {
  const override = process.env.FYD_INQUIRY_PRIVATE_DIR;
  if (override) return override;
  return join(process.cwd(), "data", "fyd-inquiries-private");
}

/**
 * Tenant-scoped store path. tenantScopedDir validates the site id
 * against the tenant pattern, which also kills path traversal.
 */
export function inquiryStorePath(siteId: string, baseDir?: string): string {
  return join(
    tenantScopedDir(baseDir ?? inquiryPrivateBaseDir(), siteId),
    "inquiries.json",
  );
}

function emptyStore(siteId: string): InquiryStoreFile {
  return { version: STORE_VERSION, siteId, inquiries: [] };
}

function isRecord(v: unknown): v is InquiryRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.receiptId === "string" &&
    typeof r.inquiryRef === "string" &&
    typeof r.siteId === "string" &&
    typeof r.serviceId === "string" &&
    typeof r.serviceLabel === "string" &&
    typeof r.visitorName === "string" &&
    typeof r.visitorContact === "string" &&
    typeof r.visitorMessage === "string" &&
    typeof r.receivedAt === "string" &&
    typeof r.eventId === "string"
  );
}

function isStoreFile(v: unknown): v is InquiryStoreFile {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    r.version === STORE_VERSION &&
    typeof r.siteId === "string" &&
    Array.isArray(r.inquiries) &&
    r.inquiries.every(isRecord)
  );
}

/**
 * Load the site's private inquiry store. Never throws: a missing or
 * corrupt file loads as empty, so a bad store can never corrupt the
 * intake. (The intake's admission failure is typed, not silent.)
 */
export function loadInquiryStore(
  siteId: string,
  baseDir?: string,
): InquiryStoreFile {
  try {
    const raw = readFileSync(inquiryStorePath(siteId, baseDir), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (isStoreFile(parsed) && parsed.siteId === siteId) return parsed;
    return emptyStore(siteId);
  } catch {
    return emptyStore(siteId);
  }
}

/**
 * Persist one inquiry record atomically (temp file + rename). Throws on
 * failure: the intake treats a private-store write failure as a failed
 * admission and issues NO receipt.
 */
export function saveInquiryRecord(
  record: InquiryRecord,
  baseDir?: string,
): void {
  const file = inquiryStorePath(record.siteId, baseDir);
  const dir = file.slice(0, file.lastIndexOf("/"));
  const store = loadInquiryStore(record.siteId, baseDir);
  if (store.inquiries.some((i) => i.receiptId === record.receiptId)) {
    throw new Error(
      "Refusing to store a duplicate inquiry receipt id: " +
        "replay must resolve, never re-store.",
    );
  }
  const next: InquiryStoreFile = {
    version: STORE_VERSION,
    siteId: record.siteId,
    inquiries: [...store.inquiries, record],
  };
  const tmp = file + ".tmp";
  mkdirSync(dir, { recursive: true });
  writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n", "utf8");
  renameSync(tmp, file);
}

/** Resolve a stored record by its idempotency key (replay, not re-mutation). */
export function findInquiryByIdempotencyKey(
  siteId: string,
  key: string,
  baseDir?: string,
): InquiryRecord | null {
  const store = loadInquiryStore(siteId, baseDir);
  return (
    store.inquiries.find(
      (i) => i.idempotencyKey !== null && i.idempotencyKey === key,
    ) ?? null
  );
}

/** The receipt view of a stored record: proof of acceptance, no PII. */
export function receiptForRecord(record: InquiryRecord): InquiryReceipt {
  return {
    receiptId: record.receiptId,
    inquiryRef: record.inquiryRef,
    siteId: record.siteId,
    serviceId: record.serviceId,
    serviceLabel: record.serviceLabel,
    receivedAt: record.receivedAt,
    eventId: record.eventId,
  };
}

// ---------------------------------------------------------------------------
// Rate limits: rolling hourly windows, tenant-scoped, durable ledger.
// The ledger stores only window counters and sender HASHES: no PII.
// ---------------------------------------------------------------------------

/** The intake policy. Exported so tests and the rate ledger agree. */
export const INQUIRY_RATE_POLICY = {
  /** Max admitted inquiries per site per rolling hour. */
  sitePerHour: 20,
  /** Max admitted inquiries per sender (contact hash) per rolling hour. */
  senderPerHour: 3,
  windowMs: 3600_000,
} as const;

interface RateWindow {
  windowStart: number;
  count: number;
}

interface RateLedgerFile {
  version: typeof RATE_VERSION;
  siteId: string;
  site: RateWindow;
  senders: Record<string, RateWindow>;
}

export function inquiryRatePath(siteId: string, baseDir?: string): string {
  return join(
    tenantScopedDir(baseDir ?? inquiryPrivateBaseDir(), siteId),
    "rate.json",
  );
}

function emptyRate(siteId: string): RateLedgerFile {
  return {
    version: RATE_VERSION,
    siteId,
    site: { windowStart: 0, count: 0 },
    senders: {},
  };
}

function isRateWindow(v: unknown): v is RateWindow {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return typeof r.windowStart === "number" && typeof r.count === "number";
}

function isRateFile(v: unknown): v is RateLedgerFile {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  const senders = r.senders;
  return (
    r.version === RATE_VERSION &&
    typeof r.siteId === "string" &&
    isRateWindow(r.site) &&
    typeof senders === "object" &&
    senders !== null &&
    Object.values(senders).every(isRateWindow)
  );
}

function loadRateLedger(
  siteId: string,
  baseDir?: string,
): RateLedgerFile {
  try {
    const raw = readFileSync(inquiryRatePath(siteId, baseDir), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (isRateFile(parsed) && parsed.siteId === siteId) return parsed;
    return emptyRate(siteId);
  } catch {
    return emptyRate(siteId);
  }
}

function persistRateLedger(
  siteId: string,
  ledger: RateLedgerFile,
  baseDir?: string,
): void {
  const file = inquiryRatePath(siteId, baseDir);
  const dir = file.slice(0, file.lastIndexOf("/"));
  const tmp = file + ".tmp";
  mkdirSync(dir, { recursive: true });
  writeFileSync(tmp, JSON.stringify(ledger, null, 2) + "\n", "utf8");
  renameSync(tmp, file);
}

function windowStartFor(nowMs: number): number {
  return (
    Math.floor(nowMs / INQUIRY_RATE_POLICY.windowMs) *
    INQUIRY_RATE_POLICY.windowMs
  );
}

function currentWindow(w: RateWindow, nowMs: number): RateWindow {
  const start = windowStartFor(nowMs);
  if (w.windowStart !== start) return { windowStart: start, count: 0 };
  return w;
}

export type RateScope = "site" | "sender";

export interface RateCheck {
  ok: true;
}
export interface RateLimited {
  ok: false;
  scope: RateScope;
}
export type RateVerdict = RateCheck | RateLimited;

/**
 * Pure check: would this intake exceed a rate limit? Reads the durable
 * ledger; writes nothing.
 */
export function checkInquiryRate(
  siteId: string,
  contact: string,
  nowMs: number,
  baseDir?: string,
): RateVerdict {
  const ledger = loadRateLedger(siteId, baseDir);
  const site = currentWindow(ledger.site, nowMs);
  if (site.count >= INQUIRY_RATE_POLICY.sitePerHour) {
    return { ok: false, scope: "site" };
  }
  const sender = currentWindow(
    ledger.senders[inquirySenderKey(contact)] ?? { windowStart: 0, count: 0 },
    nowMs,
  );
  if (sender.count >= INQUIRY_RATE_POLICY.senderPerHour) {
    return { ok: false, scope: "sender" };
  }
  return { ok: true };
}

/**
 * Record one admitted intake in the durable ledger. Called only after
 * the admission is durable; a ledger write failure throws so the intake
 * fails closed instead of silently dropping its rate accounting.
 */
export function recordInquiryRate(
  siteId: string,
  contact: string,
  nowMs: number,
  baseDir?: string,
): void {
  const ledger = loadRateLedger(siteId, baseDir);
  const site = currentWindow(ledger.site, nowMs);
  const key = inquirySenderKey(contact);
  const sender = currentWindow(
    ledger.senders[key] ?? { windowStart: 0, count: 0 },
    nowMs,
  );
  const next: RateLedgerFile = {
    version: RATE_VERSION,
    siteId,
    site: { windowStart: site.windowStart, count: site.count + 1 },
    senders: {
      ...ledger.senders,
      [key]: { windowStart: sender.windowStart, count: sender.count + 1 },
    },
  };
  persistRateLedger(siteId, next, baseDir);
}
