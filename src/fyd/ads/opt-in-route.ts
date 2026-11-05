/**
 * /api/fyd/ads/opt-in
 *
 * The publisher opt-in API for the FYD objects economic loop
 * (lane B5; DESIGN.md component F).
 *
 * GET returns the calling publisher's current opt-in state,
 * projected from the inventory store at request time (slot declared
 * or not, consent active / revoked / never granted, the disclosure
 * version the current consent pins). POST executes one command:
 * { action: "grant", slotId, surface, slotKind, compositionCapacity,
 *   disclosureTextVersion, consentId? } declares the slot when new
 * and grants consent under the pinned disclosure copy;
 * { action: "revoke", slotId, consentId } revokes the current
 * consent, which stops delivery at the next composition.
 *
 * Trust law (DESIGN.md security section, following the B4 events
 * route's pattern):
 * - The route is part of the sponsored path, so the loop enable
 *   flag gates it: flag off -> 404, nothing read or written.
 * - The publisher identity is resolved SERVER-SIDE from the
 *   authenticated fyd_session cookie through the tenant binding
 *   resolver (the identity stack is the seam for real owners; the
 *   default resolver is unbound, exactly as in B4, so no cookie can
 *   assert a tenancy the system never granted). No session, no
 *   command: 401. A resolved tenant that is not the loop's one
 *   controlled publisher is refused: 403.
 * - The body is validated field by field against a fixed key set.
 *   Identity-shaped fields (publisherTenantId, actorTenantId,
 *   actorIdentityRef, tenant scope, classification) are unknown
 *   fields here and are rejected, never honored: a body cannot
 *   assert who is acting.
 * - All writes go through the B5 opt-in commands into the B1 store
 *   command paths. Store rejections surface as typed errors; a
 *   corrupt store is a typed 500 and appends nothing.
 */

import { NextRequest, NextResponse } from "next/server";
import { CorruptAdsLogError } from "@/fyd/ads/event-log";
import {
  AdsStoreError,
  AdsTenantScopeError,
} from "@/fyd/ads/event-log";
import {
  grantOptIn,
  readOptInState,
  revokeOptIn,
  slotReadback,
  type SlotKind,
} from "@/fyd/ads/opt-in";
import { isAdsLoopEnabled, LOOP_PUBLISHER_TENANT_ID } from "@/fyd/ads/policy";
import { loadAuthConfig } from "@/fyd/identity/config";
import {
  parseCookies,
  readSessionValue,
  SESSION_COOKIE_NAME,
} from "@/fyd/identity/session";


/** Max request body bytes the opt-in route will parse. */
const OPT_IN_MAX_BODY_BYTES = 16 * 1024;

const SLOT_KINDS: ReadonlySet<string> = new Set([
  "portal-object",
  "object-context",
]);

/* ------------------------------------------------------------------ */
/* Server-side publisher identity                                      */
/* ------------------------------------------------------------------ */

/**
 * Maps an authenticated identity to the tenant it acts for. The
 * default is deliberately unbound (shared with the B4 events
 * route): v1 has no identity-to-tenant binding store, and inventing
 * one here would let a cookie assert tenancy the system never
 * granted.
 */
export type AdsTenantBindingResolver = (identityId: string) => string | null;

export const unboundAdsTenantBinding: AdsTenantBindingResolver = () => null;

export interface AdsOptInRouteDeps {
  /** Tenant binding override (tests); default unbound. */
  resolveTenantIdForIdentity?: AdsTenantBindingResolver;
  /** Environment override (tests); default process.env. */
  env?: Readonly<Record<string, string | undefined>>;
}

export interface AdsOptInActor {
  identityId: string;
  tenantId: string;
  /** The actor ref recorded in consent events. */
  actorIdentityRef: string;
}

/**
 * Resolve the acting publisher from the request's session cookie,
 * never from the body. Returns null when there is no valid session
 * or the binding resolver maps the identity to no tenant; the
 * handlers turn that into a 401, never a guess.
 */
export function resolveAdsOptInActor(
  request: NextRequest,
  deps: AdsOptInRouteDeps = {},
): AdsOptInActor | null {
  try {
    const config = loadAuthConfig(
      (deps.env ?? process.env) as NodeJS.ProcessEnv,
    );
    if (!config.session.configured) return null;
    const cookies = parseCookies(request.headers.get("cookie"));
    const session = readSessionValue(
      cookies[SESSION_COOKIE_NAME],
      config.session.secret,
    );
    if (!session) return null;
    const resolveTenant =
      deps.resolveTenantIdForIdentity ?? unboundAdsTenantBinding;
    const tenantId = resolveTenant(session.identityId);
    if (!tenantId) return null;
    return {
      identityId: session.identityId,
      tenantId,
      actorIdentityRef: session.identityId,
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Body validation: strict shape, fixed key set                        */
/* ------------------------------------------------------------------ */

/** Typed rejection for a malformed opt-in body. */
export class AdsOptInRequestError extends Error {
  readonly code = "invalid-opt-in-request" as const;
  constructor(message: string) {
    super(message);
    this.name = "AdsOptInRequestError";
  }
}

const BODY_KEYS: ReadonlySet<string> = new Set([
  "action",
  "slotId",
  "surface",
  "slotKind",
  "compositionCapacity",
  "disclosureTextVersion",
  "consentId",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AdsOptInRequestError("field " + key + " must be non-empty text");
  }
  return value;
}

function optionalText(
  body: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = body[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AdsOptInRequestError("field " + key + " must be non-empty text");
  }
  return value;
}

export type AdsOptInCommandBody =
  | {
      action: "grant";
      slotId: string;
      surface: string;
      slotKind: SlotKind;
      compositionCapacity: number;
      disclosureTextVersion: string;
      consentId?: string;
    }
  | { action: "revoke"; slotId: string; consentId: string };

/**
 * Validate an unknown body as an opt-in command and build the
 * command object. Throws AdsOptInRequestError on any defect,
 * including any field outside the fixed key set: identity is never
 * a body field in this flow. Value-level consent law (pinned
 * version, scope coverage, lifecycle) remains the store's
 * authority and is not re-decided here.
 */
export function parseAdsOptInBody(body: unknown): AdsOptInCommandBody {
  if (!isRecord(body)) {
    throw new AdsOptInRequestError("opt-in body must be a JSON object");
  }
  for (const key of Object.keys(body)) {
    if (!BODY_KEYS.has(key)) {
      throw new AdsOptInRequestError("unknown opt-in field: " + key);
    }
  }
  const action = requiredText(body, "action");
  if (action === "grant") {
    const slotKind = requiredText(body, "slotKind");
    if (!SLOT_KINDS.has(slotKind)) {
      throw new AdsOptInRequestError("field slotKind is not a slot kind");
    }
    const capacity = body.compositionCapacity;
    if (
      typeof capacity !== "number" ||
      !Number.isInteger(capacity) ||
      capacity <= 0
    ) {
      throw new AdsOptInRequestError(
        "field compositionCapacity must be a positive integer",
      );
    }
    const command: AdsOptInCommandBody = {
      action: "grant",
      slotId: requiredText(body, "slotId"),
      surface: requiredText(body, "surface"),
      slotKind: slotKind as SlotKind,
      compositionCapacity: capacity,
      disclosureTextVersion: requiredText(body, "disclosureTextVersion"),
    };
    const consentId = optionalText(body, "consentId");
    if (consentId !== undefined) command.consentId = consentId;
    return command;
  }
  if (action === "revoke") {
    return {
      action: "revoke",
      slotId: requiredText(body, "slotId"),
      consentId: requiredText(body, "consentId"),
    };
  }
  throw new AdsOptInRequestError("field action must be grant or revoke");
}

/* ------------------------------------------------------------------ */
/* The handlers                                                        */
/* ------------------------------------------------------------------ */

function errorJson(
  status: number,
  code: string,
  message: string,
): NextResponse {
  return NextResponse.json({ ok: false, code, message }, { status });
}

function loopDisabled(): NextResponse {
  return errorJson(
    404,
    "ads-loop-disabled",
    "The FYD ads loop is not enabled.",
  );
}

/**
 * Gate the handlers on loop-publisher identity: returns the actor,
 * or the error response to send (401 no resolvable session, 403 a
 * tenant that is not the loop's controlled publisher).
 */
function requireLoopPublisher(
  request: NextRequest,
  deps: AdsOptInRouteDeps,
): { actor: AdsOptInActor } | { response: NextResponse } {
  const actor = resolveAdsOptInActor(request, deps);
  if (actor === null) {
    return {
      response: errorJson(
        401,
        "publisher-session-required",
        "A publisher session is required for the opt-in flow.",
      ),
    };
  }
  if (actor.tenantId !== LOOP_PUBLISHER_TENANT_ID) {
    return {
      response: errorJson(
        403,
        "not-loop-publisher",
        "The opt-in flow serves the loop's controlled publisher only.",
      ),
    };
  }
  return { actor };
}

function storeErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof AdsTenantScopeError) {
    return errorJson(403, "tenant-scope", error.message);
  }
  if (error instanceof AdsStoreError) {
    return errorJson(400, "opt-in-rejected", error.message);
  }
  if (error instanceof CorruptAdsLogError) {
    return errorJson(
      500,
      "loop-store-corrupt",
      "The loop store is corrupt; nothing was written.",
    );
  }
  return null;
}

export function createAdsOptInGetHandler(deps: AdsOptInRouteDeps = {}) {
  return async function GET(request: NextRequest): Promise<NextResponse> {
    if (!isAdsLoopEnabled(deps.env)) return loopDisabled();
    const gate = requireLoopPublisher(request, deps);
    if ("response" in gate) return gate.response;
    return NextResponse.json(
      { ok: true, state: readOptInState(gate.actor.tenantId) },
      { status: 200 },
    );
  };
}

export function createAdsOptInPostHandler(deps: AdsOptInRouteDeps = {}) {
  return async function POST(request: NextRequest): Promise<NextResponse> {
    if (!isAdsLoopEnabled(deps.env)) return loopDisabled();
    const gate = requireLoopPublisher(request, deps);
    if ("response" in gate) return gate.response;
    const actor = gate.actor;
    const declaredLength = Number(
      request.headers.get("content-length") ?? "0",
    );
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > OPT_IN_MAX_BODY_BYTES
    ) {
      return errorJson(
        413,
        "payload-too-large",
        "Opt-in body exceeds the size bound.",
      );
    }
    let raw: string;
    try {
      raw = await request.text();
    } catch {
      return errorJson(
        400,
        "invalid-opt-in-request",
        "Opt-in body could not be read.",
      );
    }
    if (Buffer.byteLength(raw, "utf8") > OPT_IN_MAX_BODY_BYTES) {
      return errorJson(
        413,
        "payload-too-large",
        "Opt-in body exceeds the size bound.",
      );
    }
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return errorJson(
        400,
        "invalid-opt-in-request",
        "Opt-in body is not valid JSON.",
      );
    }
    let command: AdsOptInCommandBody;
    try {
      command = parseAdsOptInBody(body);
    } catch (error) {
      if (error instanceof AdsOptInRequestError) {
        return errorJson(400, error.code, error.message);
      }
      throw error;
    }
    try {
      const state =
        command.action === "grant"
          ? grantOptIn({
              actorTenantId: actor.tenantId,
              actorIdentityRef: actor.actorIdentityRef,
              slotId: command.slotId,
              surface: command.surface,
              slotKind: command.slotKind,
              compositionCapacity: command.compositionCapacity,
              disclosureTextVersion: command.disclosureTextVersion,
              consentId: command.consentId,
            })
          : revokeOptIn({
              actorTenantId: actor.tenantId,
              actorIdentityRef: actor.actorIdentityRef,
              slotId: command.slotId,
              consentId: command.consentId,
            });
      return NextResponse.json(
        { ok: true, slot: slotReadback(state) },
        { status: 200 },
      );
    } catch (error) {
      const response = storeErrorResponse(error);
      if (response) return response;
      throw error;
    }
  };
}

