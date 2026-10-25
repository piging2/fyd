/**
 * Submission mailer (2026-10-23, FYD-FORMS-FIX-PREP-20261023).
 *
 * Why this exists: every public form on the FYD site (nomination,
 * featured application, assessment request, quote inquiry, contact)
 * persisted ONLY to a server-local JSON file. On Vercel the
 * serverless filesystem is read-only outside /tmp, so every store
 * write threw and every submission was lost behind an HTTP 500. No
 * form sent email anywhere.
 *
 * This module makes email the delivery path that cannot be broken by
 * the filesystem: on acceptance, the submission is emailed to the
 * operator inbox (default nolangesk@gmail.com, where submissions are
 * retrievable) and the file store is kept only as a best-effort
 * secondary record. A store failure can never fail a submission
 * again, and a mail failure can never fail a submission that the
 * store accepted.
 *
 * Credential interface (env names only; values are set in the Vercel
 * project, never in code):
 *   FYD_SUBMISSION_EMAIL_TO  destination inbox
 *                            (default "nolangesk@gmail.com")
 *   FYD_SMTP_HOST            SMTP host (default "smtp.mail.yahoo.com")
 *   FYD_SMTP_PORT            SMTP port (default 465, implicit TLS)
 *   FYD_SMTP_USER            REQUIRED. SMTP username. The existing
 *                            sending credential is Nolan's Yahoo
 *                            mailbox (Pig central env: YAHOO_EMAIL).
 *   FYD_SMTP_PASS            REQUIRED. SMTP password / app password
 *                            (Pig central env: YAHOO_APP_PASSWORD).
 *   FYD_SMTP_FROM            From address (default: FYD_SMTP_USER)
 *
 * When FYD_SMTP_USER / FYD_SMTP_PASS are unset the mailer is
 * UNCONFIGURED and routes fall back to the legacy store-only
 * behavior, so the Pig plane (writable filesystem) is unchanged.
 *
 * The mail-building and acceptance logic here is dependency-free and
 * transport-injected for tests. The production transport is
 * nodemailer over SMTP, loaded dynamically so this module never
 * hard-fails at import time.
 */

export type SubmissionKind =
  | "nomination"
  | "featured-application"
  | "assessment-request"
  | "quote-inquiry"
  | "contact";

const KIND_LABEL: Record<SubmissionKind, string> = {
  nomination: "Nomination",
  "featured-application": "Featured application",
  "assessment-request": "Assessment request",
  "quote-inquiry": "Quote request",
  contact: "Contact message",
};

export interface SubmissionMail {
  from: string;
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

/** A transport delivers one mail. It may throw; callers never see it. */
export type MailTransport = (mail: SubmissionMail) => Promise<{ id?: string }>;

export interface SubmissionMailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
}

export const DEFAULT_SUBMISSION_EMAIL_TO = "nolangesk@gmail.com";
export const DEFAULT_SMTP_HOST = "smtp.mail.yahoo.com";
export const DEFAULT_SMTP_PORT = 465;

/**
 * Resolve the mail configuration from the environment. Returns null
 * when no sending credential is configured (FYD_SMTP_USER or
 * FYD_SMTP_PASS missing): the caller then uses store-only behavior.
 */
export function submissionMailConfig(
  env: Record<string, string | undefined> = process.env,
): SubmissionMailConfig | null {
  const user = (env.FYD_SMTP_USER ?? "").trim();
  const pass = (env.FYD_SMTP_PASS ?? "").trim();
  if (!user || !pass) return null;
  const portRaw = parseInt((env.FYD_SMTP_PORT ?? "").trim(), 10);
  return {
    host: (env.FYD_SMTP_HOST ?? "").trim() || DEFAULT_SMTP_HOST,
    port: Number.isFinite(portRaw) && portRaw > 0 ? portRaw : DEFAULT_SMTP_PORT,
    user,
    pass,
    from: (env.FYD_SMTP_FROM ?? "").trim() || user,
    to: (env.FYD_SUBMISSION_EMAIL_TO ?? "").trim() || DEFAULT_SUBMISSION_EMAIL_TO,
  };
}

export interface SubmissionFields {
  kind: SubmissionKind;
  /** Short headline for the subject line, e.g. the business name. */
  headline: string;
  /** Labeled field lines, in display order. Empty values are omitted. */
  fields: ReadonlyArray<readonly [label: string, value: string]>;
  receiptId: string;
  receivedAt: string;
  /** Set when the submitter left a reply-able email address. */
  replyTo?: string;
}

/** Build the exact email payload for a submission. Pure. */
export function buildSubmissionMail(
  submission: SubmissionFields,
  config: SubmissionMailConfig,
): SubmissionMail {
  const label = KIND_LABEL[submission.kind];
  const lines: string[] = [
    "New " + label + " from the PING FYD website.",
    "",
    "Form: " + label,
    "Receipt: " + submission.receiptId,
    "Received: " + submission.receivedAt,
    "",
  ];
  for (const [fieldLabel, value] of submission.fields) {
    const v = (value ?? "").trim();
    if (!v) continue;
    lines.push(fieldLabel + ": " + v);
  }
  lines.push(
    "",
    "This submission was delivered by email because the website's",
    "server-local file store is not durable in production. Keep this",
    "email as the retrievable record of the submission.",
  );
  const mail: SubmissionMail = {
    from: config.from,
    to: config.to,
    subject: "[PING FYD] New " + label + ": " + submission.headline,
    text: lines.join("\n") + "\n",
  };
  if (submission.replyTo) mail.replyTo = submission.replyTo;
  return mail;
}

interface NodemailerLike {
  createTransport(options: Record<string, unknown>): {
    sendMail(mail: SubmissionMail): Promise<{ messageId?: string }>;
  };
}

/** Production transport: nodemailer over SMTP. Loaded lazily. */
export async function smtpTransport(
  config: SubmissionMailConfig,
): Promise<MailTransport> {
  const nodemailer = (await import("nodemailer")) as unknown as NodemailerLike;
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
    // Serverless egress hardening: force IPv4 (Yahoo's IPv6 SMTP
    // endpoints refuse silently) and bound every wait so a dead
    // connection fails the delivery attempt instead of the request.
    family: 4,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
  return async (mail: SubmissionMail) => {
    const info = await transporter.sendMail(mail);
    return { id: info.messageId };
  };
}

export interface DeliverOutcome {
  delivered: boolean;
  id?: string;
  error?: string;
}

/** Deliver one built mail. Never throws. */
export async function deliverSubmissionMail(
  mail: SubmissionMail,
  config: SubmissionMailConfig,
  transport?: MailTransport,
): Promise<DeliverOutcome> {
  try {
    const t = transport ?? (await smtpTransport(config));
    const result = await t(mail);
    return { delivered: true, id: result.id };
  } catch (e) {
    return {
      delivered: false,
      error: e instanceof Error ? e.message : "mail transport failed",
    };
  }
}

export interface AcceptSubmissionArgs extends SubmissionFields {
  /**
   * Best-effort durable record (the legacy file store). May throw;
   * a throw is logged and never fails the submission by itself.
   * Omit for forms with no store (contact).
   */
  store?: () => void;
  env?: Record<string, string | undefined>;
  transport?: MailTransport;
  log?: (message: string) => void;
}

export interface AcceptSubmissionOutcome {
  /** True when the submission is retrievable somewhere durable. */
  accepted: boolean;
  stored: boolean;
  emailed: boolean;
  mailConfigured: boolean;
}

/**
 * The acceptance policy for every public form:
 *   1. Try the file store (best effort; failure is logged only).
 *   2. When a sending credential is configured, email the submission
 *      to the operator inbox (failure is logged only).
 *   3. The submission is accepted when EITHER path succeeded, so a
 *      filesystem failure can never 500 a submission again, and on
 *      planes without mail configured the legacy store-only behavior
 *      is preserved exactly.
 */
export async function acceptSubmission(
  args: AcceptSubmissionArgs,
): Promise<AcceptSubmissionOutcome> {
  const log =
    args.log ??
    ((message: string) => {
      // Server-side only; never surfaced to the visitor.
      console.error("[submission-mailer] " + message);
    });

  let stored = false;
  if (args.store) {
    try {
      args.store();
      stored = true;
    } catch (e) {
      log(
        "store failed for " +
          args.kind +
          " receipt " +
          args.receiptId +
          ": " +
          (e instanceof Error ? e.message : "unknown store error") +
          " (continuing to email delivery)",
      );
    }
  }

  const config = submissionMailConfig(args.env);
  let emailed = false;
  if (config) {
    const mail = buildSubmissionMail(args, config);
    const outcome = await deliverSubmissionMail(mail, config, args.transport);
    emailed = outcome.delivered;
    if (!emailed) {
      log(
        "email delivery failed for " +
          args.kind +
          " receipt " +
          args.receiptId +
          ": " +
          (outcome.error ?? "unknown mail error"),
      );
    }
  }

  return {
    accepted: stored || emailed,
    stored,
    emailed,
    mailConfigured: config !== null,
  };
}
