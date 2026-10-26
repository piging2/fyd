/**
 * FYD mail relay worker (FYD-PIG-RELAY-20261025).
 *
 * Claims pending submission records from the durable outbox
 * (private Vercel Blob store "fyd-submission-outbox", production
 * segment, tenant ping-fyd) and delivers each record's operator
 * email over Yahoo SMTP from the Pig, the one egress proven to
 * reach Yahoo. Delivery outcomes are written back onto the record:
 * persistence state (owned by the website capture) and delivery
 * state (owned here) stay separate forever.
 *
 * Discipline:
 *   - Claim before send (state "claimed" + worker id + timestamp);
 *     a claim older than STALE_CLAIM_MS is reclaimable, so a worker
 *     or WSL restart resumes delivery with no owner action.
 *   - Bounded retry with backoff; after MAX_ATTEMPTS the record
 *     stays "failed" with its last error, never silently dropped
 *     and never marked delivered without Yahoo's message id.
 *   - One email per record: a delivered record is never re-sent;
 *     the capture side is put-if-absent, so a duplicate submission
 *     cannot create a second record either.
 *   - Logs carry receipt ids and state transitions only. No record
 *     payloads, no credentials, ever.
 *
 * Credentials (read at start, never printed):
 *   ~/.ping-central.env          YAHOO_EMAIL, YAHOO_APP_PASSWORD
 *   ~/.config/ping/fyd-relay.env BLOB_READ_WRITE_TOKEN
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { list, get, put } from "@vercel/blob";
import nodemailer from "nodemailer";

const PREFIX = "outbox/v1/production/";
const WORKER_ID = "pig-relay-1";
const POLL_MS = 45_000;
const STALE_CLAIM_MS = 15 * 60_000;
const MAX_ATTEMPTS = 6;
const BACKOFF_MIN = [1, 5, 15, 60, 240, 720];

function loadEnvFile(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvFile(join(homedir(), ".ping-central.env"));
loadEnvFile(join(homedir(), ".config", "ping", "fyd-relay.env"));

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN ?? "";
const SMTP_USER = process.env.YAHOO_EMAIL ?? "";
const SMTP_PASS = process.env.YAHOO_APP_PASSWORD ?? "";
if (!BLOB_TOKEN || !SMTP_USER || !SMTP_PASS) {
  console.error(
    "[fyd-relay] missing required env (blob token or Yahoo credential); exiting",
  );
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host: "smtp.mail.yahoo.com",
  port: 465,
  secure: true,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
  // Same hardening as the website mailer: IPv4 (Yahoo's IPv6 SMTP
  // endpoints refuse silently) and bounded waits.
  family: 4,
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 30_000,
});

function sanitizeError(e) {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.slice(0, 200);
}

function log(...parts) {
  console.log("[fyd-relay]", new Date().toISOString(), ...parts);
}

async function readRecord(pathname) {
  // useCache: false is load-bearing: with the SDK's cached reads the
  // worker once re-read its own pre-claim snapshot, concluded another
  // claimant held the record, and skipped the send (2026-10-25).
  const result = await get(pathname, {
    access: "private",
    useCache: false,
    token: BLOB_TOKEN,
  });
  if (!result) return null;
  const text = await new Response(result.stream).text();
  return JSON.parse(text);
}

async function writeRecord(record) {
  await put(record.persistence.pathname, JSON.stringify(record), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    token: BLOB_TOKEN,
  });
}

function isClaimable(record, nowMs) {
  const d = record?.delivery;
  if (!d || d.state === "delivered") return false;
  if (d.state === "pending") return true;
  if (d.state === "claimed") {
    const at = d.claimedAt ? Date.parse(d.claimedAt) : 0;
    return nowMs - at > STALE_CLAIM_MS;
  }
  if (d.state === "failed") {
    if ((d.attempts ?? 0) >= MAX_ATTEMPTS) return false;
    if (!d.nextRetryAt) return true;
    return Date.parse(d.nextRetryAt) <= nowMs;
  }
  return false;
}

async function deliverOne(pathname) {
  let record = await readRecord(pathname);
  if (!record || !isClaimable(record, Date.now())) return;

  // Claim before send so a crash mid-send leaves a reclaimable
  // record instead of an untracked send.
  const claimAt = new Date().toISOString();
  record.delivery = {
    ...record.delivery,
    state: "claimed",
    claimedAt: claimAt,
    claimedBy: WORKER_ID,
  };
  await writeRecord(record);
  record = await readRecord(pathname);
  if (
    !record ||
    record.delivery.state !== "claimed" ||
    record.delivery.claimedBy !== WORKER_ID ||
    record.delivery.claimedAt !== claimAt
  ) {
    return; // Another claimant holds it; not ours to send.
  }

  const receiptId = record.receipt?.receiptId ?? pathname;
  const attempts = (record.delivery.attempts ?? 0) + 1;

  if (!record.mail) {
    record.delivery = {
      ...record.delivery,
      state: "failed",
      attempts,
      lastError: "record carries no mail payload",
      nextRetryAt: null,
    };
    await writeRecord(record);
    log("FAILED", receiptId, "no mail payload");
    return;
  }

  try {
    // Yahoo SMTP refuses (550 Mailbox unavailable) any message whose
    // Reply-To header names an external mailbox on this route
    // (bisected live 2026-10-25: replyTo present -> 550, absent ->
    // 250, subject and body innocent). The submitter's contact is
    // already a labeled field inside the body text, so the header
    // is dropped here and the operator replies manually.
    const info = await transporter.sendMail({
      from: record.mail.from,
      to: record.mail.to,
      subject: record.mail.subject,
      text: record.mail.text,
    });
    record.delivery = {
      ...record.delivery,
      state: "delivered",
      attempts,
      messageId: info.messageId ?? null,
      deliveredAt: new Date().toISOString(),
      lastError: null,
      nextRetryAt: null,
    };
    await writeRecord(record);
    log("DELIVERED", receiptId, record.kind, info.messageId ?? "");
  } catch (e) {
    const backoffMin =
      attempts >= MAX_ATTEMPTS
        ? null
        : BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)];
    record.delivery = {
      ...record.delivery,
      state: "failed",
      attempts,
      lastError: sanitizeError(e),
      nextRetryAt:
        backoffMin === null
          ? null
          : new Date(Date.now() + backoffMin * 60_000).toISOString(),
    };
    await writeRecord(record);
    log(
      "FAILED",
      receiptId,
      "attempt",
      attempts,
      record.delivery.lastError,
    );
  }
}

async function cycle() {
  const pathnames = [];
  let cursor;
  do {
    const page = await list({
      prefix: PREFIX,
      limit: 1000,
      ...(cursor ? { cursor } : {}),
      token: BLOB_TOKEN,
    });
    for (const blob of page.blobs) pathnames.push(blob.pathname);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const nowMs = Date.now();
  const candidates = [];
  for (const pathname of pathnames) {
    try {
      const record = await readRecord(pathname);
      if (record && isClaimable(record, nowMs)) {
        candidates.push({
          pathname,
          receivedAt: record.receipt?.receivedAt ?? "",
        });
      }
    } catch (e) {
      log("SKIP unreadable record", pathname, sanitizeError(e));
    }
  }
  candidates.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  for (const c of candidates) {
    await deliverOne(c.pathname);
  }
  return candidates.length;
}

let stopping = false;
process.on("SIGTERM", () => {
  stopping = true;
});
process.on("SIGINT", () => {
  stopping = true;
});

log("started", WORKER_ID, "prefix", PREFIX);
while (!stopping) {
  try {
    const n = await cycle();
    if (n > 0) log("cycle processed", n, "claimable record(s)");
  } catch (e) {
    console.error(
      "[fyd-relay]",
      new Date().toISOString(),
      "cycle error:",
      sanitizeError(e),
    );
  }
  const until = Date.now() + POLL_MS;
  while (!stopping && Date.now() < until) {
    await new Promise((r) => setTimeout(r, 1000));
  }
}
log("stopped");
