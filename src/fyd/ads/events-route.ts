/**
 * POST /api/fyd/ads/events
 *
 * The loop events route (lane B4; DESIGN.md component E). Accepts
 * FydObjectEventDraft bodies from the loop collector, binds the B2
 * event ledger, and returns the recorded receipt. It is part of the
 * sponsored path, so the loop enable flag gates it: with the flag
 * off the route answers 404 and records nothing.
 *
 * Trust law (DESIGN.md security section; B2 decision 2):
 * - The ONLY body fields read are the draft's own fields. The body
 *   is validated field by field and the draft object passed to the
 *   ledger is constructed here; client-supplied classification,
 *   receipt, count, actor, or ingest fields are unknown fields and
 *   are rejected, never honored.
 * - Ingest context is resolved SERVER-SIDE: the user agent from the
 *   user-agent header verbatim, and the actor tenant from the
 *   authenticated session (the identity stack's fyd_session cookie)
 *   mapped through the tenant binding resolver. The default
 *   resolver is unbound (v1 has no identity-to-tenant binding
 *   store; the design names that stack as the seam for real
 *   owners), so anonymous viewer events carry no actor tenant and
 *   the ledger's SELF check cannot fire for them.
 * - Malformed bodies are a typed 400 and write nothing. A corrupt
 *   loop store is a typed 500 and appends nothing (the ledger's
 *   own fail-closed law).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  AdsEventLedger,
  LedgerCorruptError,
  LedgerValidationError,
  type LedgerIngestContext,
} from "@/fyd/ads/event-ledger";
import { CorruptAdsLogError } from "@/fyd/ads/event-log";
import {
  ADS_EVENTS_MAX_BODY_BYTES,
  isAdsLoopEnabled,
} from "@/fyd/ads/policy";
import type {
  FydObjectAction,
  FydObjectEventDraft,
} from "@/fyd/rank/object-events";
import { loadAuthConfig } from "@/fyd/identity/config";
import {
  parseCookies,
  readSessionValue,
  SESSION_COOKIE_NAME,
} from "@/fyd/identity/session";


/* ------------------------------------------------------------------ */
/* Draft validation: strict shape, constructive build                  */
/* ------------------------------------------------------------------ */

/** Typed rejection for a malformed event draft body. */
export class AdsEventDraftError extends Error {
  readonly code = "invalid-event-draft" as const;
  constructor(message: string) {
    super(message);
    this.name = "AdsEventDraftError";
  }
}

const DRAFT_KEYS: ReadonlySet<string> = new Set([
  "type",
  "objectId",
  "surface",
  "correlationId",
  "renderInstanceId",
  "occurredAt",
  "actor",
  "action",
  "sponsorship",
  "dedupeKey",
]);

const ACTIONS: ReadonlySet<string> = new Set([
  "OBJECT_OPEN",
  "OBJECT_CLOSE",
  "WEBSITE_OPEN",
  "FOLLOW",
  "UNFOLLOW",
  "LIKE",
  "UNLIKE",
  "CALL",
  "DIRECTIONS",
  "MESSAGE",
  "ASK_FYD",
  "EVIDENCE_OPEN",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(
  body: Record<string, unknown>,
  key: string,
): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AdsEventDraftError("draft field " + key + " must be non-empty text");
  }
  return value;
}

function optionalText(
  record: Record<string, unknown>,
  key: string,
  owner: string,
): string | undefined {
  const value = record[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AdsEventDraftError(owner + "." + key + " must be non-empty text");
  }
  return value;
}

/**
 * Validate an unknown body as an event draft and build the draft
 * object. Throws AdsEventDraftError on any defect. Value-level
 * validity (known type strings, action/type agreement, impression
 * evidence) remains the ledger validator's authority; this layer
 * enforces the shape the contract defines, including the rejection
 * of unknown fields.
 */
export function parseAdsEventDraft(body: unknown): FydObjectEventDraft {
  if (!isRecord(body)) {
    throw new AdsEventDraftError("event body must be a JSON object");
  }
  for (const key of Object.keys(body)) {
    if (!DRAFT_KEYS.has(key)) {
      throw new AdsEventDraftError("unknown draft field: " + key);
    }
  }
  const type = requiredText(body, "type");
  const occurredAt = body.occurredAt;
  if (typeof occurredAt !== "number" || !Number.isFinite(occurredAt)) {
    throw new AdsEventDraftError("draft field occurredAt must be a finite number");
  }
  const draft: Record<string, unknown> = {
    type,
    objectId: requiredText(body, "objectId"),
    surface: requiredText(body, "surface"),
    correlationId: requiredText(body, "correlationId"),
    renderInstanceId: requiredText(body, "renderInstanceId"),
    occurredAt,
    dedupeKey: requiredText(body, "dedupeKey"),
  };
  if (body.actor !== undefined) {
    if (!isRecord(body.actor)) {
      throw new AdsEventDraftError("draft field actor must be an object");
    }
    for (const key of Object.keys(body.actor)) {
      if (key !== "viewerId" && key !== "sessionId") {
        throw new AdsEventDraftError("unknown actor field: " + key);
      }
    }
    const actor: Record<string, string> = {};
    const viewerId = optionalText(body.actor, "viewerId", "actor");
    const sessionId = optionalText(body.actor, "sessionId", "actor");
    if (viewerId !== undefined) actor.viewerId = viewerId;
    if (sessionId !== undefined) actor.sessionId = sessionId;
    draft.actor = actor;
  }
  if (body.action !== undefined) {
    if (typeof body.action !== "string" || !ACTIONS.has(body.action)) {
      throw new AdsEventDraftError("draft field action is not a contract action");
    }
    draft.action = body.action as FydObjectAction;
  }
  if (body.sponsorship !== undefined) {
    if (!isRecord(body.sponsorship)) {
      throw new AdsEventDraftError("draft field sponsorship must be an object");
    }
    for (const key of Object.keys(body.sponsorship)) {
      if (key !== "placementId" && key !== "campaignId" && key !== "payerId") {
        throw new AdsEventDraftError("unknown sponsorship field: " + key);
      }
    }
    draft.sponsorship = {
      placementId: requiredText(body.sponsorship, "placementId"),
      campaignId: requiredText(body.sponsorship, "campaignId"),
      payerId: requiredText(body.sponsorship, "payerId"),
    };
  }
  return draft as unknown as FydObjectEventDraft;
}

/* ------------------------------------------------------------------ */
/* Server-side ingest context                                          */
/* ------------------------------------------------------------------ */

/**
 * Maps an authenticated identity to the tenant it acts for. The
 * default is deliberately unbound: no identity-to-tenant binding
 * store exists in v1, and inventing one here would let a cookie
 * assert tenancy the system never granted.
 */
export type AdsTenantBindingResolver = (identityId: string) => string | null;

export const unboundAdsTenantBinding: AdsTenantBindingResolver = () => null;

export interface AdsEventsRouteDeps {
  /** Ledger override (tests); default a fresh AdsEventLedger. */
  ledger?: AdsEventLedger;
  /** Tenant binding override (tests); default unbound. */
  resolveTenantIdForIdentity?: AdsTenantBindingResolver;
  /** Environment override (tests); default process.env. */
  env?: Readonly<Record<string, string | undefined>>;
}

/**
 * Resolve the ingest context from the request itself, never from
 * the body: user agent from its header; actor tenant from a valid
 * fyd_session cookie whose identity the binding resolver maps to a
 * tenant. Any resolution failure degrades to an anonymous viewer
 * (no actor tenant), never to an error and never to a guess.
 */
export function resolveAdsEventIngestContext(
  request: NextRequest,
  deps: AdsEventsRouteDeps = {},
): LedgerIngestContext {
  const context: LedgerIngestContext = {};
  const userAgent = request.headers.get("user-agent");
  if (userAgent) context.userAgent = userAgent;
  try {
    const config = loadAuthConfig(
      (deps.env ?? process.env) as NodeJS.ProcessEnv,
    );
    if (config.session.configured) {
      const cookies = parseCookies(request.headers.get("cookie"));
      const session = readSessionValue(
        cookies[SESSION_COOKIE_NAME],
        config.session.secret,
      );
      if (session) {
        const resolveTenant =
          deps.resolveTenantIdForIdentity ?? unboundAdsTenantBinding;
        const tenantId = resolveTenant(session.identityId);
        if (tenantId) context.actorTenantId = tenantId;
      }
    }
  } catch {
    // An unresolvable session is an anonymous viewer, not a 500.
  }
  return context;
}

/* ------------------------------------------------------------------ */
/* The handler                                                         */
/* ------------------------------------------------------------------ */

function errorJson(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export function createAdsEventsPostHandler(deps: AdsEventsRouteDeps = {}) {
  return async function POST(request: NextRequest): Promise<NextResponse> {
    if (!isAdsLoopEnabled(deps.env)) {
      return errorJson(
        404,
        "ads-loop-disabled",
        "The FYD ads loop is not enabled.",
      );
    }
    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > ADS_EVENTS_MAX_BODY_BYTES
    ) {
      return errorJson(413, "payload-too-large", "Event body exceeds the size bound.");
    }
    let raw: string;
    try {
      raw = await request.text();
    } catch {
      return errorJson(400, "invalid-event-draft", "Event body could not be read.");
    }
    if (Buffer.byteLength(raw, "utf8") > ADS_EVENTS_MAX_BODY_BYTES) {
      return errorJson(413, "payload-too-large", "Event body exceeds the size bound.");
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return errorJson(400, "invalid-event-draft", "Event body is not valid JSON.");
    }
    let draft: FydObjectEventDraft;
    try {
      draft = parseAdsEventDraft(body);
    } catch (error) {
      if (error instanceof AdsEventDraftError) {
        return errorJson(400, error.code, error.message);
      }
      throw error;
    }
    const ledger = deps.ledger ?? new AdsEventLedger();
    const ingest = resolveAdsEventIngestContext(request, deps);
    try {
      const receipt = await ledger.publish(draft, ingest);
      return NextResponse.json(
        { ok: true, status: receipt.status, receiptRef: receipt.receiptRef },
        { status: 201 },
      );
    } catch (error) {
      if (error instanceof LedgerValidationError) {
        return errorJson(400, "invalid-event-draft", error.message);
      }
      if (
        error instanceof LedgerCorruptError ||
        error instanceof CorruptAdsLogError
      ) {
        return errorJson(
          500,
          "loop-store-corrupt",
          "The loop event store is corrupt; nothing was recorded.",
        );
      }
      throw error;
    }
  };
}

