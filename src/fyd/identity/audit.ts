/**
 * Audit log for identity binding events (test authority logged).
 *
 * Every sign-up, sign-in, link, unlink, refresh, and sign-out appends one
 * entry. Entries carry identity and provider-account metadata only:
 * provider tokens, secrets, and emails never enter the audit log, journal
 * payloads, generated pages, or agent context.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export type AuthAuditEventType =
  | "sign_up"
  | "sign_in"
  | "link"
  | "unlink"
  | "sign_out"
  | "refresh";

export interface AuthAuditEntry {
  at: string;
  event: AuthAuditEventType;
  identityId: string;
  provider?: string;
  /** provider::issuer::subject. Never a secret. */
  providerAccountId?: string;
  note?: string;
}

export type AuditSink = (entry: AuthAuditEntry) => void;

let testSink: AuditSink | null = null;

/** Test-only hook so the test authority can observe audit events. */
export function setAuditSink(sink: AuditSink | null): void {
  testSink = sink;
}

function defaultDir(): string {
  return process.env.FYD_IDENTITY_DIR || join(process.cwd(), "data", "fyd-identity");
}

/**
 * Append one audit entry. Failures to write the log never fail the
 * operation; the entry is still delivered to the test sink.
 */
export function appendAuthAudit(
  event: AuthAuditEventType,
  args: {
    identityId: string;
    provider?: string;
    providerAccountId?: string;
    note?: string;
    at?: string;
    dir?: string;
  }
): AuthAuditEntry {
  const entry: AuthAuditEntry = {
    at: args.at || new Date().toISOString(),
    event,
    identityId: args.identityId,
    provider: args.provider,
    providerAccountId: args.providerAccountId,
    note: args.note,
  };
  if (testSink) {
    try {
      testSink(entry);
    } catch {
      // sink failures never break auth flows
    }
  }
  try {
    const dir = args.dir || defaultDir();
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "audit.jsonl"), JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // audit write failures never break auth flows
  }
  return entry;
}

/** Redact helper: audit and logs must never carry raw emails. */
export function redactEmail(email: string | undefined): string | undefined {
  if (!email) return undefined;
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return "***@" + email.slice(at + 1);
}
