/**
 * PING Secret Broker — the ONE custody pattern for all of PING (Lane L).
 *
 * Agents and connector code NEVER receive tokens. They receive an opaque
 * capability handle scoped to (principal, operation, target, audience,
 * time window, max uses). The broker resolves the real secret at execution
 * time INSIDE the trusted seam via broker.execute(), and the secret never
 * crosses into agent-visible context.
 *
 * Harvested mechanisms (see lane-l/HARVEST.md):
 *  - macaroons: additive scope narrowing (attenuation) — server-side caveats
 *  - Vault: lease/TTL ceilings + revocation kills outstanding handles
 *  - SPIFFE: no long-lived secret touches the worker; audience binding
 *  - STS/RFC8693/capability-URLs: TTL + audience-bound delegation
 *
 * Failure taxonomy follows the program charter (lane K owns the canonical
 * enum; this module mirrors it so the swap is one import line):
 *   AUTH_REQUIRED | EXPIRED | PERMISSION_DENIED | SOURCE_UNAVAILABLE |
 *   RATE_LIMITED | TIMEOUT | TRANSIENT | PERMANENT
 *
 * AUDIT INVARIANT: audit records carry handle fingerprint + metadata + outcome.
 * They NEVER carry the secret value. Enforced by construction (the value is
 * only ever in the `secret` local of execute()) and by test.
 */

import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

export type BrokerFailure =
  | "AUTH_REQUIRED"
  | "EXPIRED"
  | "PERMISSION_DENIED"
  | "SOURCE_UNAVAILABLE"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "TRANSIENT"
  | "PERMANENT";

export class BrokerError extends Error {
  readonly code: BrokerFailure;
  constructor(code: BrokerFailure, message: string) {
    super(message);
    this.name = "BrokerError";
    this.code = code;
  }
}

/** The full scope a handle is bound to. All fields must match exactly on use. */
export interface HandleScope {
  /** Attested worker identity, e.g. "connector:github:svc-1" */
  principal: string;
  /** Closed verb + object, e.g. "fetch:issues" */
  operation: string;
  /** Target identity, e.g. "github.com/owner/repo" */
  target: string;
  /** Tenant, from trusted context. REQUIRED; the caller can never substitute it. */
  tenantId: string;
  /** Trusted execution seam id; secrets resolve ONLY for this audience */
  audience: string;
  /** Seconds from issuance. Default 300, hard ceiling 900. */
  ttlSeconds?: number;
  /** Executions allowed. Default 1. */
  maxUses?: number;
}

export interface RequestInput extends HandleScope {
  /** Which stored credential this handle may resolve (versioned id). */
  credentialId: string;
  /** Free-text purpose, recorded in audit. Optional. */
  purpose?: string;
}

/** Policy port: who may hold which scope. Default implementation denies all. */
export type AuthorizeFn = (scope: {
  principal: string;
  operation: string;
  target: string;
  tenantId: string;
}) => boolean;

/** Credential storage backend. Env-backed by default; KMS later. */
export interface CredentialStore {
  get(credentialId: string): string | undefined;
  set(credentialId: string, value: string): void;
  has(credentialId: string): boolean;
}

export class EnvCredentialStore implements CredentialStore {
  get(credentialId: string): string | undefined {
    return process.env[credentialId];
  }
  set(credentialId: string, value: string): void {
    process.env[credentialId] = value;
  }
  has(credentialId: string): boolean {
    return process.env[credentialId] !== undefined;
  }
}

export interface AuditRecord {
  seq: number;
  ts: string;
  event: "issued" | "executed" | "denied" | "revoked" | "rotated" | "attenuated" | "renewed";
  /** sha256(handle) truncated — correlatable, not replayable */
  handleFp: string;
  principal: string;
  operation: string;
  target: string;
  tenantId: string;
  audience: string;
  purpose?: string;
  outcome?: BrokerFailure | "OK";
  reason?: string;
  usesLeft?: number;
}

interface HandleRecord {
  scope: Required<Pick<HandleScope, "principal" | "operation" | "target" | "tenantId" | "audience">> & {
    ttlSeconds: number;
    maxUses: number;
  };
  credentialId: string;
  purpose?: string;
  issuedAt: number;
  notAfter: number;
  usesLeft: number;
  revoked: boolean;
  executed: boolean;
}

const HANDLE_PREFIX = "pingsec_1_";
export const MAX_TTL_SECONDS = 900;
const DEFAULT_TTL_SECONDS = 300;
/** Max total lease lifetime across renewals: 24h, then fresh issuance required. */
export const MAX_TOTAL_LEASE_SECONDS = 86_400;

export interface BrokerOptions {
  authorize?: AuthorizeFn;
  store?: CredentialStore;
  /** For tests: ms since epoch. */
  now?: () => number;
  /** Trusted seam ids allowed as audience. Empty = any audience string allowed. */
  audiences?: string[];
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export class SecretBroker {
  private handles = new Map<string, HandleRecord>();
  private auditLog: AuditRecord[] = [];
  private seq = 0;
  private authorize: AuthorizeFn;
  private store: CredentialStore;
  private now: () => number;
  private audiences: Set<string> | null;

  constructor(opts: BrokerOptions = {}) {
    this.authorize = opts.authorize ?? (() => false);
    this.store = opts.store ?? new EnvCredentialStore();
    this.now = opts.now ?? (() => Date.now());
    this.audiences = opts.audiences ? new Set(opts.audiences) : null;
  }

  private fp(handle: string): string {
    return createHash("sha256").update(handle).digest("hex").slice(0, 16);
  }

  private audit(
    event: AuditRecord["event"],
    handle: string,
    rec: HandleRecord | null,
    outcome?: AuditRecord["outcome"],
    reason?: string,
  ): void {
    this.auditLog.push({
      seq: ++this.seq,
      ts: new Date(this.now()).toISOString(),
      event,
      handleFp: this.fp(handle),
      principal: rec?.scope.principal ?? "?",
      operation: rec?.scope.operation ?? "?",
      target: rec?.scope.target ?? "?",
      tenantId: rec?.scope.tenantId ?? "?",
      audience: rec?.scope.audience ?? "?",
      purpose: rec?.purpose,
      outcome,
      reason,
      usesLeft: rec?.usesLeft,
    });
  }

  /** Issue an opaque capability handle. Denies by default via the policy port. */
  request(input: RequestInput): string {
    const { principal, operation, target, tenantId, audience, credentialId } = input;
    if (!principal || !operation || !target || !tenantId || !audience || !credentialId) {
      throw new BrokerError("PERMISSION_DENIED", "request: all scope fields + credentialId required");
    }
    if (!this.authorize({ principal, operation, target, tenantId })) {
      throw new BrokerError(
        "PERMISSION_DENIED",
        `request: principal "${principal}" not authorized for "${operation}" on "${target}" (tenant "${tenantId}")`,
      );
    }
    if (this.audiences && !this.audiences.has(audience)) {
      throw new BrokerError("PERMISSION_DENIED", `request: unknown audience "${audience}"`);
    }
    const ttlSeconds = Math.min(input.ttlSeconds ?? DEFAULT_TTL_SECONDS, MAX_TTL_SECONDS);
    if (ttlSeconds <= 0) {
      throw new BrokerError("PERMISSION_DENIED", "request: ttlSeconds must be positive");
    }
    const maxUses = input.maxUses ?? 1;
    if (maxUses <= 0) {
      throw new BrokerError("PERMISSION_DENIED", "request: maxUses must be positive");
    }
    const handle = HANDLE_PREFIX + b64url(randomBytes(32));
    const issuedAt = this.now();
    const rec: HandleRecord = {
      scope: { principal, operation, target, tenantId, audience, ttlSeconds, maxUses },
      credentialId,
      purpose: input.purpose,
      issuedAt,
      notAfter: issuedAt + ttlSeconds * 1000,
      usesLeft: maxUses,
      revoked: false,
      executed: false,
    };
    this.handles.set(handle, rec);
    this.audit("issued", handle, rec, "OK");
    return handle;
  }

  /**
   * Attenuate: derive a NARROWER handle from a live one (macaroon-style).
   * Every field must equal the parent's; only ttl may shrink and maxUses may drop.
   */
  attenuate(handle: string, narrower: { ttlSeconds?: number; maxUses?: number }): string {
    const rec = this.handles.get(handle);
    if (!rec || rec.revoked || this.now() > rec.notAfter || rec.usesLeft <= 0) {
      throw new BrokerError("EXPIRED", "attenuate: parent handle not live");
    }
    const ttlSeconds = Math.min(narrower.ttlSeconds ?? rec.scope.ttlSeconds, rec.scope.ttlSeconds);
    const maxUses = Math.min(narrower.maxUses ?? rec.scope.maxUses, rec.scope.maxUses);
    const child = HANDLE_PREFIX + b64url(randomBytes(32));
    const issuedAt = this.now();
    const childRec: HandleRecord = {
      scope: { ...rec.scope, ttlSeconds, maxUses },
      credentialId: rec.credentialId,
      issuedAt,
      notAfter: Math.min(issuedAt + ttlSeconds * 1000, rec.notAfter),
      usesLeft: maxUses,
      revoked: false,
      executed: false,
    };
    this.handles.set(child, childRec);
    this.audit("attenuated", child, childRec, "OK", `parent=${this.fp(handle)}`);
    return child;
  }

  /**
   * Execute inside the trusted seam. The secret is resolved here and passed
   * ONLY to fn; it is never returned to the caller and never leaves this frame.
   * assertedScope must EXACTLY match the handle's bound scope.
   */
  async execute<T>(
    handle: string,
    asserted: { principal: string; operation: string; target: string; tenantId: string; audience: string },
    fn: (secret: string) => Promise<T> | T,
  ): Promise<T> {
    const rec = this.handles.get(handle);
    if (!rec) {
      throw new BrokerError("AUTH_REQUIRED", "execute: unknown handle");
    }
    const deny = (code: BrokerFailure, reason: string): never => {
      this.audit("denied", handle, rec, code, reason);
      throw new BrokerError(code, `execute: ${reason}`);
    };
    if (rec.revoked) deny("PERMISSION_DENIED", "handle revoked");
    if (this.now() > rec.notAfter) deny("EXPIRED", "handle expired");
    if (rec.usesLeft <= 0) deny("PERMISSION_DENIED", "handle exhausted");
    // Scope binding: exact match on all five axes. No downgrade, no closest match.
    // (compare digests so timingSafeEqual never throws on length mismatch)
    const s = rec.scope;
    const digest = (v: string) => createHash("sha256").update(v).digest();
    const eq = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));
    if (
      !eq(asserted.principal, s.principal) ||
      !eq(asserted.operation, s.operation) ||
      !eq(asserted.target, s.target) ||
      !eq(asserted.tenantId, s.tenantId) ||
      !eq(asserted.audience, s.audience)
    ) {
      deny("PERMISSION_DENIED", "scope mismatch (principal/operation/target/tenantId/audience)");
    }
    const secret = this.store.get(rec.credentialId);
    if (secret === undefined) {
      // Fail closed: the secret backend is unreachable — do NOT run fn.
      this.audit("denied", handle, rec, "SOURCE_UNAVAILABLE", `credential "${rec.credentialId}" missing`);
      throw new BrokerError("SOURCE_UNAVAILABLE", `execute: credential "${rec.credentialId}" unavailable`);
    }
    rec.usesLeft -= 1;
    try {
      const out = await fn(secret);
      rec.executed = true;
      this.audit("executed", handle, rec, "OK");
      return out;
    } catch {
      // SEAM ERROR MASKING (RT-1): provider errors may echo secret material
      // (401 bodies, .cause chains). NOTHING thrown inside the seam crosses it
      // verbatim: the caller gets only the lane-K code + correlation id, and
      // the audit records the sanitized reason, never the original message.
      const correlation = this.fp(handle);
      this.audit("executed", handle, rec, "TRANSIENT", `provider error masked (correlation ${correlation})`);
      throw new BrokerError("TRANSIENT", `execute: provider call failed (correlation ${correlation})`);
    }
  }

  /**
   * Extend a live handle's lease. Re-checks full scope binding and credential
   * validity; total lifetime from issuance is capped at MAX_TOTAL_LEASE_SECONDS,
   * after which a fresh issuance (re-consent) is required. Audited.
   */
  renew(
    handle: string,
    asserted: { principal: string; operation: string; target: string; tenantId: string; audience: string },
    extendSeconds: number,
  ): void {
    const rec = this.handles.get(handle);
    if (!rec) throw new BrokerError("AUTH_REQUIRED", "renew: unknown handle");
    if (rec.revoked) throw new BrokerError("PERMISSION_DENIED", "renew: handle revoked");
    if (this.now() > rec.notAfter) throw new BrokerError("EXPIRED", "renew: handle expired");
    if (rec.usesLeft <= 0) throw new BrokerError("PERMISSION_DENIED", "renew: handle exhausted");
    const s = rec.scope;
    const digest = (v: string) => createHash("sha256").update(v).digest();
    const eq = (a: string, b: string) => timingSafeEqual(digest(a), digest(b));
    if (
      !eq(asserted.principal, s.principal) ||
      !eq(asserted.operation, s.operation) ||
      !eq(asserted.target, s.target) ||
      !eq(asserted.tenantId, s.tenantId) ||
      !eq(asserted.audience, s.audience)
    ) {
      this.audit("denied", handle, rec, "PERMISSION_DENIED", "renew: scope mismatch");
      throw new BrokerError("PERMISSION_DENIED", "renew: scope mismatch");
    }
    if (extendSeconds <= 0 || extendSeconds > MAX_TTL_SECONDS) {
      throw new BrokerError("PERMISSION_DENIED", "renew: extendSeconds must be within (0, 900]");
    }
    const maxNotAfter = rec.issuedAt + MAX_TOTAL_LEASE_SECONDS * 1000;
    if (rec.notAfter + extendSeconds * 1000 > maxNotAfter) {
      this.audit("denied", handle, rec, "PERMISSION_DENIED", "renew: exceeds max total lease lifetime");
      throw new BrokerError("PERMISSION_DENIED", "renew: exceeds max total lease lifetime; re-issue required");
    }
    if (this.store.get(rec.credentialId) === undefined) {
      throw new BrokerError("SOURCE_UNAVAILABLE", `renew: credential "${rec.credentialId}" unavailable`);
    }
    rec.notAfter += extendSeconds * 1000;
    this.audit("renewed", handle, rec, "OK", `extended ${extendSeconds}s`);
  }

  revoke(handle: string): void {
    const rec = this.handles.get(handle);
    if (rec && !rec.revoked) {
      rec.revoked = true;
      rec.usesLeft = 0;
      this.audit("revoked", handle, rec, "OK");
    }
  }

  /** Kill switch: revoke every outstanding handle for a principal. Returns count. */
  revokeAll(principal: string): number {
    let n = 0;
    for (const [h, rec] of this.handles) {
      if (rec.scope.principal === principal && !rec.revoked && rec.usesLeft > 0) {
        rec.revoked = true;
        rec.usesLeft = 0;
        this.audit("revoked", h, rec, "OK", "revokeAll");
        n++;
      }
    }
    return n;
  }

  /**
   * Rotation: swap the stored credential value. Outstanding UNEXECUTED handles
   * resolve the NEW value; executed handles are sealed (their uses are spent).
   */
  rotate(credentialId: string, newValue: string): void {
    this.store.set(credentialId, newValue);
    for (const [h, rec] of this.handles) {
      if (rec.credentialId === credentialId && !rec.executed) {
        this.audit("rotated", h, rec, "OK", `credential "${credentialId}" rotated`);
      }
    }
  }

  /** Read-only copy of the audit trail. Contains NO secret values by construction. */
  auditTrail(): readonly AuditRecord[] {
    return [...this.auditLog];
  }
}
