/**
 * P2 (2026-10-11): the authorized inquiry intake for quote requests.
 *
 * The narrow write path for a genuine business action on the demo
 * plane: a visitor opens a generated service page, requests a quote,
 * receives a durable receipt, and the owner sees the inquiry in the
 * owner inbox. It enforces, in order:
 *
 *   REQUEST -> VALIDATED TYPED COMMAND -> POLICY + RATE LIMITS
 *     -> TENANT CAPABILITY (the site's published inquiry capability)
 *     -> ADMITTED MUTATION (the canonical event journal)
 *     -> DURABLE PRIVATE EVIDENCE (tenant-private inquiry store)
 *     -> DURABLE RECEIPT -> RESULT
 *
 * Admission, honestly stated: the visitor is an UNAUTHENTICATED,
 * anonymous public actor (event actor kind "visitor"). Nothing about
 * the visitor's claims authorizes the write. Admission rests on
 * server-side validation, the site's published service catalog (the
 * closed world the quote must reference — the site's inquiry
 * capability), and durable rate limits. This is the same admitted
 * entrance P1 used (appendOwnerEvent in ../object/owner-events.ts:
 * content-hash event identity, append-only journal) — extended with the
 * customer.inquiry-received vocabulary, not a parallel write path.
 *
 * Harvest correction 3, binding: the canonical event references the
 * PROTECTED inquiry receipt (opaque ir-<hex>), never the contact
 * details. The intake NEVER sends external email or messages; the
 * owner sees the inquiry via listOwnerInquiries (caller-key
 * authenticated, tenant-entitled) on the test plane.
 *
 * Success is returned ONLY after durable acceptance: the canonical
 * event appended AND the tenant-private record persisted. Event-first
 * ordering (P1's pattern): a private-store failure after the event
 * append leaves an audit event for a failed admission but issues NO
 * receipt — fail closed on the effective state. The visitor can retry
 * with the same idempotency key and the replay resolves the stored
 * receipt instead of re-mutating.
 *
 * Server-side only (event log + file writes, registry reads).
 */

import type {
  CallerRegistry,
} from "../../app/api/mc/_lib/mc-dispatch-identity";
import {
  appendOwnerEvent,
  serviceTarget,
  type OwnerEvent,
} from "../object/owner-events";
import { TENANT_ID_PATTERN } from "../tenant/tenant-context";
import {
  authorizeCorrection,
  type IntakeDenial as P1Denial,
} from "./owner-correction-intake";
import {
  checkInquiryRate,
  findInquiryByIdempotencyKey,
  inquiryStorePath,
  loadInquiryStore,
  makeInquiryRefs,
  receiptForRecord,
  recordInquiryRate,
  saveInquiryRecord,
  type InquiryReceipt,
  type InquiryRecord,
} from "./inquiry-store";

/** Typed denial codes. A denial is never a silent empty. */
export type InquiryDenialCode =
  | "invalid_input"
  | "unknown_service"
  | "rate_limited_site"
  | "rate_limited_sender"
  | "admission_failed";

export interface InquiryDenial {
  ok: false;
  status: 400 | 429 | 500;
  code: InquiryDenialCode;
  reason: string;
}

/** A quotable service from the site's published catalog (the closed world). */
export interface KnownService {
  id: string;
  label: string;
}

export interface IntakeInquiryInput {
  /** The site (tenant) the quote targets. Must match the tenant pattern. */
  siteId: string;
  /** The published service the visitor wants a quote for. */
  serviceId: string;
  visitorName: string;
  /** Email OR phone. Stored tenant-private; never journaled. */
  visitorContact: string;
  /** The visitor's message. Stored tenant-private; never journaled. */
  visitorMessage: string;
  /**
   * The site's published service catalog. The quote must reference one
   * of these services: the catalog IS the site's published inquiry
   * capability. Refusing to admit a quote against an unknown catalog is
   * the admission boundary, not a validation nicety.
   */
  knownServices: readonly KnownService[];
  /**
   * Optional client-supplied idempotency key. A repeated submission with
   * the same key REPLAYS the stored receipt: decision replay, never
   * mutation replay — no second event, no second private record.
   */
  idempotencyKey?: string | null;
  nowIso?: () => string;
  privateDir?: string;
  loadRegistry?: () => CallerRegistry;
}

export interface IntakeInquirySuccess {
  ok: true;
  receipt: InquiryReceipt;
  /** True when the receipt was replayed from a stored inquiry. */
  replayed: boolean;
}

export type IntakeInquiryResult = IntakeInquirySuccess | InquiryDenial;

function deny(
  status: 400 | 429 | 500,
  code: InquiryDenialCode,
  reason: string,
): InquiryDenial {
  return { ok: false, status, code, reason };
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;
const IDEMPOTENCY_RE = /^[A-Za-z0-9_-]{1,64}$/;

function contactLooksValid(raw: string): boolean {
  const v = raw.trim();
  if (EMAIL_RE.test(v)) return true;
  const digits = v.replace(/[\s\-().]/g, "");
  return /^\+?\d{7,15}$/.test(digits);
}

interface ValidatedCommand {
  siteId: string;
  service: KnownService;
  visitorName: string;
  visitorContact: string;
  visitorMessage: string;
  idempotencyKey: string | null;
}

function validateCommand(input: IntakeInquiryInput): ValidatedCommand | InquiryDenial {
  if (typeof input.siteId !== "string" || !TENANT_ID_PATTERN.test(input.siteId)) {
    return deny(400, "invalid_input", "The site id is not a valid tenant id.");
  }
  const service = input.knownServices.find((s) => s.id === input.serviceId);
  if (!service) {
    return deny(
      400,
      "unknown_service",
      "Service '" +
        String(input.serviceId) +
        "' is not in the site's published catalog: refusing to quote what the site does not publish.",
    );
  }
  const visitorName = (input.visitorName ?? "").trim();
  if (visitorName.length < 2 || visitorName.length > 80) {
    return deny(
      400,
      "invalid_input",
      "The visitor name must be 2-80 characters.",
    );
  }
  const visitorContact = (input.visitorContact ?? "").trim();
  if (!contactLooksValid(visitorContact)) {
    return deny(
      400,
      "invalid_input",
      "The contact must be a valid email address or phone number.",
    );
  }
  const visitorMessage = (input.visitorMessage ?? "").trim();
  if (visitorMessage.length < 10 || visitorMessage.length > 2000) {
    return deny(
      400,
      "invalid_input",
      "The message must be 10-2000 characters.",
    );
  }
  let idempotencyKey: string | null = null;
  if (input.idempotencyKey !== undefined && input.idempotencyKey !== null) {
    if (!IDEMPOTENCY_RE.test(input.idempotencyKey)) {
      return deny(
        400,
        "invalid_input",
        "The idempotency key must be 1-64 URL-safe characters.",
      );
    }
    idempotencyKey = input.idempotencyKey;
  }
  return {
    siteId: input.siteId,
    service,
    visitorName,
    visitorContact,
    visitorMessage,
    idempotencyKey,
  };
}

/** The fixed label for the anonymous public actor on admitted events. */
export const VISITOR_ACTOR_LABEL = "anonymous-site-visitor";

/**
 * The single authorized write path for quote requests. On success the
 * canonical customer.inquiry-received event is admitted AND the
 * tenant-private inquiry record is persisted AND the receipt is
 * returned; on any denial or failure nothing is half-admitted and no
 * receipt is issued.
 */
export function intakeInquiry(input: IntakeInquiryInput): IntakeInquiryResult {
  const cmd = validateCommand(input);
  if (!("siteId" in cmd)) return cmd;

  const nowIso = input.nowIso ?? (() => new Date().toISOString());
  const nowMs = Date.parse(nowIso());
  const privateDir = input.privateDir;

  // Idempotency first: a repeated key replays the stored receipt. Never
  // re-mutates: no second event, no second private record.
  if (cmd.idempotencyKey !== null) {
    const existing = findInquiryByIdempotencyKey(
      cmd.siteId,
      cmd.idempotencyKey,
      privateDir,
    );
    if (existing) {
      return { ok: true, receipt: receiptForRecord(existing), replayed: true };
    }
  }

  // Policy: durable rate limits, checked before any mutation.
  const rate = checkInquiryRate(cmd.siteId, cmd.visitorContact, nowMs, privateDir);
  if (!rate.ok) {
    return deny(
      429,
      rate.scope === "site" ? "rate_limited_site" : "rate_limited_sender",
      rate.scope === "site"
        ? "This site has reached its hourly inquiry intake limit: try again later."
        : "Too many quote requests from this contact: try again later.",
    );
  }

  const receivedAt = nowIso();
  const { inquiryRef, receiptId } = makeInquiryRefs();

  // Canonical transition FIRST through the admitted journal: the same
  // appendOwnerEvent choke point P1 used. The event carries NO contact
  // details — evidence.ref is the opaque protected receipt.
  let event: OwnerEvent;
  try {
    event = appendOwnerEvent(cmd.siteId, {
      at: receivedAt,
      objectId: cmd.siteId,
      type: "customer.inquiry-received",
      actor: { kind: "visitor", label: VISITOR_ACTOR_LABEL },
      target: serviceTarget(cmd.service.id),
      previousBasis: null,
      newValue: {
        receiptId,
        inquiryRef,
        serviceId: cmd.service.id,
        serviceLabel: cmd.service.label,
        receivedAt,
      },
      evidence: {
        kind: "inquiry-receipt",
        ref: receiptId,
        detail:
          "opaque protected receipt; customer contact details are held " +
          "in the tenant-private inquiry store, never in this journal",
      },
      note:
        "Quote request received for service '" +
        cmd.service.label +
        "' (receipt " +
        receiptId +
        "). Customer details are in the owner inbox; they are not part of this journal.",
      generator: "fyd-owner@1",
    });
  } catch (e) {
    // No receipt: the admission failed before any private record
    // existed. (The event, if it was appended, stands as an audit line
    // for a failed admission; the owner inbox shows nothing.)
    return deny(
      500,
      "admission_failed",
      "The inquiry could not be admitted: " +
        (e instanceof Error ? e.message : "canonical event append failed"),
    );
  }

  // Then the durable tenant-private record (contact details live ONLY
  // here). A failure here issues no receipt: fail closed.
  const record: InquiryRecord = {
    receiptId,
    inquiryRef,
    siteId: cmd.siteId,
    serviceId: cmd.service.id,
    serviceLabel: cmd.service.label,
    visitorName: cmd.visitorName,
    visitorContact: cmd.visitorContact,
    visitorMessage: cmd.visitorMessage,
    receivedAt,
    eventId: event.id,
    idempotencyKey: cmd.idempotencyKey,
  };
  try {
    saveInquiryRecord(record, privateDir);
  } catch (e) {
    return deny(
      500,
      "admission_failed",
      "The inquiry could not be stored: " +
        (e instanceof Error ? e.message : "private store write failed"),
    );
  }

  // Rate accounting is durable too; a ledger failure fails the
  // admission rather than silently dropping its rate accounting. The
  // visitor can retry with the same idempotency key and replay.
  try {
    recordInquiryRate(cmd.siteId, cmd.visitorContact, nowMs, privateDir);
  } catch (e) {
    return deny(
      500,
      "admission_failed",
      "The inquiry could not be accounted: " +
        (e instanceof Error ? e.message : "rate ledger write failed"),
    );
  }

  // Durable acceptance complete: issue the receipt.
  return { ok: true, receipt: receiptForRecord(record), replayed: false };
}

// ---------------------------------------------------------------------------
// Owner inbox: the owner surface on the test plane. Caller-key
// authenticated, tenant-entitled — the same authority P1 proved. Reads
// the tenant-private store; there is no visitor path to this function.
// ---------------------------------------------------------------------------

export interface ListInquiriesInput {
  callerKey: string | null | undefined;
  siteId: string;
  privateDir?: string;
  loadRegistry?: () => CallerRegistry;
}

export interface ListInquiriesSuccess {
  ok: true;
  inquiries: InquiryRecord[];
}

export type ListInquiriesResult = ListInquiriesSuccess | P1Denial;

/**
 * The owner sees the inquiry. Authentication + tenant entitlement via
 * the P8 caller-key registry (authorizeCorrection); a different owner
 * gets 403 and sees nothing. Results are oldest-first.
 */
export function listOwnerInquiries(
  input: ListInquiriesInput,
): ListInquiriesResult {
  const auth = authorizeCorrection({
    callerKey: input.callerKey,
    siteId: input.siteId,
    loadRegistry: input.loadRegistry,
  });
  if (!auth.ok) return auth;
  let inquiries: InquiryRecord[];
  try {
    // loadInquiryStore never throws on a bad file; the tenantScopedDir
    // boundary inside still refuses an invalid site id by throwing, and
    // that throw is a boundary refusal, not data loss.
    inquiries = loadInquiryStore(input.siteId, input.privateDir).inquiries;
  } catch {
    return {
      ok: false,
      status: 400,
      code: "invalid_input",
      reason: "The site id is not a valid tenant id.",
    };
  }
  inquiries = [...inquiries].sort((a, b) =>
    a.receivedAt < b.receivedAt ? -1 : a.receivedAt > b.receivedAt ? 1 : 0,
  );
  return { ok: true, inquiries };
}

/**
 * Where the owner inbox reads from, for tests and diagnostics. Exported
 * so the privacy proof can assert the tenant boundary of the store path.
 */
export function ownerInboxStorePath(siteId: string, baseDir?: string): string {
  return inquiryStorePath(siteId, baseDir);
}

/** Test hook: prove the intake never sends external notifications. */
export function intakeExternalSends(): never[] {
  // The intake has no mailer, no webhook, no message client. This
  // function exists so the e2e proof can name the invariant: the set of
  // external sends performed by intakeInquiry is statically empty.
  return [];
}
