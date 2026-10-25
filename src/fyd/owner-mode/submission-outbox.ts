/**
 * Submission outbox (2026-10-25, FYD-PIG-RELAY-20261025).
 *
 * Why this exists: the submission mailer (submission-mailer.ts) made
 * email the acceptance path because the server-local file store is
 * not durable on Vercel. Production then proved a second failure:
 * SMTP egress from Vercel's serverless functions to Yahoo is
 * refused, so in-request email delivery fails too and both forms
 * returned 500 again. The credential is good (proven from the Pig);
 * only the Vercel egress is broken.
 *
 * The relay design (owner greenlight 2026-10-25): capture and
 * delivery are separate, separately-stated steps.
 *
 *   1. CAPTURE (this module, in the Vercel function): the validated
 *      submission is persisted as ONE durable record in a private
 *      Vercel Blob store ("fyd-submission-outbox") BEFORE success is
 *      acknowledged. The record carries the fully built operator
 *      email, a persistence state, and a separate delivery state
 *      that starts "pending".
 *   2. DELIVERY (the Pig mail worker): a small worker on the Pig
 *      claims pending records from the store, sends each record's
 *      email over the proven Yahoo SMTP route, and writes the
 *      delivery outcome back onto the record (delivered + message
 *      id, or failed + bounded-retry schedule). The worker never
 *      runs in the request path, so a Pig restart or outage only
 *      delays delivery; it can never lose a captured lead.
 *
 * Invariants:
 *   - Persistence state and delivery state are separate fields and
 *     are never merged into one "done" flag.
 *   - A record counts as delivered only when the worker has written
 *     Yahoo's acceptance (message id) back onto it.
 *   - Idempotency: the blob pathname embeds an idempotency key (the
 *     form's dedupe key, or the receipt id for anonymous
 *     submissions, or a hash of the normalized email for newsletter
 *     signups). A repeat submission replays the stored receipt and
 *     creates neither a second record nor a second email.
 *   - Tenant isolation: every pathname is scoped by tenant id, and
 *     the worker claims only the production environment segment of
 *     the tenant that owns this deployment.
 *   - No credential lives in a record: the blob token comes from the
 *     environment (BLOB_READ_WRITE_TOKEN) and the Yahoo credential
 *     never leaves the Pig worker.
 *
 * The blob client is dependency-injected for tests, mirroring the
 * mailer's transport injection. The production client wraps
 * @vercel/blob, loaded dynamically so importing this module never
 * hard-fails.
 */

import { createHash } from "node:crypto";
import type { SubmissionMail } from "./submission-mailer";

export const OUTBOX_VERSION = 1 as const;

/** The tenant that owns this deployment's forms (the stores' site id). */
export const PING_FYD_TENANT_ID = "ping-fyd";

export type OutboxKind =
  | "nomination"
  | "featured-application"
  | "newsletter-signup";

export type OutboxDeliveryState =
  | "pending"
  | "claimed"
  | "delivered"
  | "failed";

export interface OutboxReceipt {
  receiptId: string;
  /** nominationRef / applicationRef; null for newsletter signups. */
  refId: string | null;
  /** Business name for form receipts; null for newsletter signups. */
  businessName: string | null;
  receivedAt: string;
}

export interface OutboxRecord {
  version: typeof OUTBOX_VERSION;
  tenantId: string;
  environment: string;
  kind: OutboxKind;
  /** Idempotency key within (environment, tenant, kind). */
  key: string;
  receipt: OutboxReceipt;
  /** The form's own stored-record fields (or the signup record). */
  payload: Record<string, unknown>;
  /** The fully built operator email, or null when no sender identity is configured. */
  mail: SubmissionMail | null;
  persistence: {
    state: "persisted";
    at: string;
    store: "vercel-blob";
    pathname: string;
  };
  delivery: {
    state: OutboxDeliveryState;
    attempts: number;
    claimedAt: string | null;
    claimedBy: string | null;
    messageId: string | null;
    deliveredAt: string | null;
    lastError: string | null;
    nextRetryAt: string | null;
  };
  /** Newsletter only: Kit sync is a separate integration from capture. */
  kitSync?: {
    state: "not_configured" | "synced" | "failed";
    at: string | null;
    note: string;
  };
}

/** Minimal blob surface the outbox needs. Injected in tests. */
export interface OutboxBlobClient {
  /** True when a blob exists at the pathname. */
  head(pathname: string): Promise<boolean>;
  /** Parsed JSON at the pathname, or null when absent/unreadable. */
  getJson(pathname: string): Promise<OutboxRecord | null>;
  /** Write JSON. Throws when the blob exists and allowOverwrite is false. */
  putJson(
    pathname: string,
    record: OutboxRecord,
    opts: { allowOverwrite: boolean },
  ): Promise<void>;
}

interface VercelBlobLike {
  head(pathname: string): Promise<unknown>;
  get(
    pathname: string,
    opts: { access: "private" },
  ): Promise<{ stream: ReadableStream } | null>;
  put(
    pathname: string,
    body: string,
    opts: {
      access: "private";
      addRandomSuffix: boolean;
      allowOverwrite: boolean;
      contentType: string;
    },
  ): Promise<unknown>;
  BlobNotFoundError: new (...args: never[]) => Error;
}

/** Production blob client over @vercel/blob. Loaded lazily. */
export async function vercelOutboxClient(): Promise<OutboxBlobClient> {
  const sdk = (await import("@vercel/blob")) as unknown as VercelBlobLike;
  return {
    async head(pathname: string): Promise<boolean> {
      try {
        await sdk.head(pathname);
        return true;
      } catch (e) {
        if (e instanceof sdk.BlobNotFoundError) return false;
        throw e;
      }
    },
    async getJson(pathname: string): Promise<OutboxRecord | null> {
      const result = await sdk.get(pathname, { access: "private" });
      if (!result) return null;
      const text = await new Response(result.stream).text();
      return JSON.parse(text) as OutboxRecord;
    },
    async putJson(
      pathname: string,
      record: OutboxRecord,
      opts: { allowOverwrite: boolean },
    ): Promise<void> {
      await sdk.put(pathname, JSON.stringify(record), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: opts.allowOverwrite,
        contentType: "application/json",
      });
    },
  };
}

/** The outbox is configured when the blob token is in the environment. */
export function outboxConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (env.BLOB_READ_WRITE_TOKEN ?? "").trim().length > 0;
}

/** Deployment environment segment (VERCEL_ENV); "local" off Vercel. */
export function outboxEnvironment(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = (env.VERCEL_ENV ?? "").trim().toLowerCase();
  const clean = raw.replace(/[^a-z0-9-]/g, "");
  return clean || "local";
}

function sanitizeKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Tenant- and environment-scoped pathname for one outbox record. */
export function outboxPathname(
  tenantId: string,
  kind: OutboxKind,
  key: string,
  env: Record<string, string | undefined> = process.env,
): string {
  return (
    "outbox/v1/" +
    outboxEnvironment(env) +
    "/" +
    sanitizeKey(tenantId) +
    "/" +
    kind +
    "/" +
    sanitizeKey(key) +
    ".json"
  );
}

/** Newsletter idempotency key: sha256 of the normalized email. */
export function newsletterOutboxKey(normalizedEmail: string): string {
  return createHash("sha256")
    .update("newsletter:" + normalizedEmail.trim().toLowerCase())
    .digest("hex");
}

export interface PersistToOutboxArgs {
  tenantId: string;
  kind: OutboxKind;
  key: string;
  receipt: OutboxReceipt;
  payload: Record<string, unknown>;
  mail: SubmissionMail | null;
  kitSync?: OutboxRecord["kitSync"];
  env?: Record<string, string | undefined>;
  client?: OutboxBlobClient;
  now?: () => Date;
}

export interface PersistToOutboxResult {
  configured: boolean;
  persisted: boolean;
  /** True when the key already held a record (no second write). */
  replayed: boolean;
  record?: OutboxRecord;
  existing?: OutboxRecord;
  error?: string;
}

/**
 * Persist one submission record. Never throws.
 *
 * Put-if-absent semantics give the idempotency guarantee: an existing
 * pathname is never overwritten by capture, so a duplicate submission
 * can never create a second record (and the worker delivers each
 * record exactly once by state, so it cannot create a second email).
 */
export async function persistToOutbox(
  args: PersistToOutboxArgs,
): Promise<PersistToOutboxResult> {
  const env = args.env ?? process.env;
  if (!args.client && !outboxConfigured(env)) {
    return { configured: false, persisted: false, replayed: false };
  }
  const pathname = outboxPathname(args.tenantId, args.kind, args.key, env);
  try {
    const client = args.client ?? (await vercelOutboxClient());
    if (await client.head(pathname)) {
      const existing = (await client.getJson(pathname)) ?? undefined;
      return {
        configured: true,
        persisted: true,
        replayed: true,
        existing,
      };
    }
    const now = (args.now ?? (() => new Date()))().toISOString();
    const record: OutboxRecord = {
      version: OUTBOX_VERSION,
      tenantId: args.tenantId,
      environment: outboxEnvironment(env),
      kind: args.kind,
      key: args.key,
      receipt: args.receipt,
      payload: args.payload,
      mail: args.mail,
      persistence: {
        state: "persisted",
        at: now,
        store: "vercel-blob",
        pathname,
      },
      delivery: {
        state: "pending",
        attempts: 0,
        claimedAt: null,
        claimedBy: null,
        messageId: null,
        deliveredAt: null,
        lastError: null,
        nextRetryAt: null,
      },
      ...(args.kitSync ? { kitSync: args.kitSync } : {}),
    };
    try {
      await client.putJson(pathname, record, { allowOverwrite: false });
    } catch (putError) {
      // A concurrent capture may have won the pathname between the
      // head check and the put; that is a replay, not a failure.
      if (await client.head(pathname)) {
        const existing = (await client.getJson(pathname)) ?? undefined;
        return {
          configured: true,
          persisted: true,
          replayed: true,
          existing,
        };
      }
      throw putError;
    }
    return { configured: true, persisted: true, replayed: false, record };
  } catch (e) {
    return {
      configured: true,
      persisted: false,
      replayed: false,
      error: e instanceof Error ? e.message : "outbox persist failed",
    };
  }
}

/**
 * Look up the stored receipt for an idempotency key (dedupe replay).
 * Never throws; a lookup failure returns null and the caller proceeds
 * to capture, where a persist failure surfaces honestly.
 */
export async function findOutboxRecord(
  tenantId: string,
  kind: OutboxKind,
  key: string,
  env: Record<string, string | undefined> = process.env,
  client?: OutboxBlobClient,
): Promise<OutboxRecord | null> {
  if (!client && !outboxConfigured(env)) return null;
  try {
    const c = client ?? (await vercelOutboxClient());
    const pathname = outboxPathname(tenantId, kind, key, env);
    if (!(await c.head(pathname))) return null;
    return await c.getJson(pathname);
  } catch {
    return null;
  }
}
