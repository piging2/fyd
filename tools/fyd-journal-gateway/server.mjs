#!/usr/bin/env node
/**
 * FYD Journal Gateway (demo journal).
 *
 * What this is:
 *   The standalone demo journal server that PingObjectReader.queryFydSiteOverlays
 *   (src/lib/ping/ping-object-reader.ts, the :3100 FYD site server) expects at
 *   FYD_JOURNAL_GATEWAY_URL, default http://127.0.0.1:18199. The FYD overlay
 *   events live in the FYD demo journal, a separate deployment from the main
 *   PING gateway (:8080), so they get their own base URL.
 *
 * Contract (mirrors the main gateway's GET /events/:stream and the ask-lane
 * test stub at src/app/api/fyd/ask/__tests__/stub-journal.ts):
 *   GET  /events/FYD_SITE_OVERLAY?tenant=<tenant_id>[&limit=&offset=]
 *     -> 200 { events: [ { event_id, timestamp, event_type, tenant_id,
 *                          aggregate_id, aggregate_type, event_data } ],
 *              stream, count, limit, offset, tenant }
 *        Events are returned in journal (timestamp ascending) order.
 *        Tenant scoping is enforced server-side: the tenant query param is
 *        REQUIRED (400 tenant_required without it) and only events whose
 *        immutable tenant_id exactly matches are returned. The reader keeps
 *        its own event_data.siteId filter as defense in depth. Other (non
 *        FYD-scoped) streams keep the legacy unfiltered shape.
 *   POST /events
 *     Body: { event_type, tenant_id, aggregate_id?, aggregate_type?, event_data, request_id? }
 *     -> 200 { event_id, deduped }  (the accepted event's id)
 *     Tenant enforcement on append (FYD_SITE_OVERLAY): tenant_id is REQUIRED
 *     and immutable (in this runtime the tenant id IS the site id). The
 *     gateway refuses with 400 tenant_mismatch when tenant_id is missing
 *     or invalid, when aggregate_id is present and != "fyd-site:<tenant_id>",
 *     or when event_data.siteId != tenant_id. A spoofed envelope is never
 *     journaled under another tenant's name.
 *     Write-boundary P0: when request_id (string, <=128 chars) is present
 *     and was seen before UNDER THE SAME TENANT, the gateway returns the
 *     ORIGINAL event_id with deduped:true and appends NOTHING. This is the
 *     backstop that makes lost-response retries and crash recovery
 *     converge: any retry that reaches the gateway with the same
 *     request_id gets the original event instead of a duplicate. A
 *     DIFFERENT tenant reusing the request_id gets a 400
 *     request_id_tenant_conflict WITHOUT learning the original event_id
 *     (zero disclosure). The in-memory index is rebuilt from the store at
 *     startup (first record wins), so dedupe survives restarts. The
 *     check -> append -> index-update sequence is synchronous (no awaits
 *     between), so concurrent same-request_id POSTs cannot both append.
 *     Used by src/fyd/customize/server.ts emitOverlayEvent to journal
 *     owner-approved presentation-intent overlays.
 *   GET  /  -> 200 { ok: true, service, store, journal } (health +
 *     FYD-037 journal identity assertion; `journal` is live-derived from
 *     the store path, never a static string)
 *   Anything else -> 404 { error }
 *
 * Storage: append-only JSONL at FYD_JOURNAL_STORE (default
 *   <repo>/data/fyd-journal/events.jsonl), one event object per line.
 *   Loopback only (default 127.0.0.1); no auth, same trust model the reader
 *   already assumes (it issues unauthenticated fetches).
 *
 * Seeded content: the 7 happy-place FYD_SITE_OVERLAY events. The original
 * demo journal was lost before this gateway was (re)built; the seeded ops
 * and timestamps are transcribed from the ask-lane test stub, whose header
 * documents them as mirroring the 7 real overlay events from the FYD demo
 * journal. Seeded ids are minted (fyd-seed-ovl-*) since the originals are
 * unrecoverable; the ops themselves are verbatim, including their
 * "demo-owner (seeded, unverified)" approval labels.
 */

import { createServer } from "node:http";
import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.FYD_JOURNAL_PORT || "18199", 10);
const HOST = process.env.FYD_JOURNAL_HOST || "127.0.0.1";
const STORE =
  process.env.FYD_JOURNAL_STORE ||
  join(HERE, "..", "..", "data", "fyd-journal", "events.jsonl");
const MAX_BODY = 1024 * 1024;

// Write-side tenant-smuggling fix (Q-P0-06 finding #2): POST /events
// requires server-side caller verification. The gateway and its one
// trusted writer (the :3100 FYD site server's emitOverlayEvent) share a
// bearer token via FYD_JOURNAL_WRITE_TOKEN. A body-supplied tenant_id is
// never journaled as the event's tenant without the caller proving the
// token first; the loopback binding stays as defense in depth. Fail
// closed: with no token configured, writes are refused (typed 503) rather
// than silently falling back to unauthenticated appends. Deploy note:
// set FYD_JOURNAL_WRITE_TOKEN for the gateway process AND send
// `Authorization: Bearer <token>` from the trusted writer before restart,
// or legitimate overlay emits will be denied.
const WRITE_TOKEN = process.env.FYD_JOURNAL_WRITE_TOKEN || "";

// FYD-037: the journal asserts its own identity on GET /. Live-derived
// from the runtime store path at startup (never a static string): two
// gateway processes serving different stores assert different markers,
// so an emit/dump pre-flight can tell the FYD demo journal apart from
// any other journal, including the main PING journal. Callers compare
// against their EXPECTED_OVERLAY_JOURNAL_MARKER ("fyd-demo-journal",
// suffix after "@" allowed to vary) and fail closed on mismatch or on
// an unreadable marker.
const JOURNAL_MARKER =
  "fyd-demo-journal@" +
  createHash("sha256")
    .update("fyd-journal-gateway|" + STORE, "utf8")
    .digest("hex")
    .slice(0, 12);

const TENANT_ID_PATTERN = /^[a-z0-9-]{1,64}$/;

function isValidTenantId(v) {
  return typeof v === "string" && TENANT_ID_PATTERN.test(v);
}

/**
 * Immutable tenant id of a stored record. In-memory backfill only (the
 * store file is never rewritten): records journaled before tenant_id was
 * mandatory carry the tenant in event_data.siteId / aggregate_id.
 */
function tenantIdOf(rec) {
  if (rec && isValidTenantId(rec.tenant_id)) return rec.tenant_id;
  const data =
    rec && typeof rec.event_data === "object" && rec.event_data !== null
      ? rec.event_data
      : null;
  const sid = data ? data.siteId : null;
  if (isValidTenantId(sid)) return sid;
  const agg = rec ? rec.aggregate_id : null;
  if (typeof agg === "string" && agg.startsWith("fyd-site:")) {
    const t = agg.slice("fyd-site:".length);
    if (isValidTenantId(t)) return t;
  }
  return null;
}

function loadEvents() {
  if (!existsSync(STORE)) return [];
  const out = [];
  for (const line of readFileSync(STORE, "utf8").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const rec = JSON.parse(t);
      rec.tenant_id = tenantIdOf(rec);
      out.push(rec);
    } catch {
      /* skip corrupt line, keep serving */
    }
  }
  out.sort((a, b) => String(a.timestamp || "").localeCompare(String(b.timestamp || "")));
  return out;
}

// Write-boundary P0: request_id -> { tenantId, eventId }. A request_id is
// bound to the tenant that first used it: the same tenant may replay it
// idempotently, but a DIFFERENT tenant reusing it is rejected without
// learning the original event_id (zero disclosure across tenants).
// The event record IS the index entry (stored on the record itself), so
// there is no two-file atomicity problem. Rebuilt from disk at startup
// (tenantIdOf backfills legacy records in memory); updated synchronously
// on every append.
const requestIndex = new Map();
function rebuildRequestIndex() {
  requestIndex.clear();
  for (const e of loadEvents()) {
    if (e && typeof e.request_id === "string" && e.request_id && !requestIndex.has(e.request_id)) {
      requestIndex.set(e.request_id, { tenantId: e.tenant_id || null, eventId: e.event_id });
    }
  }
}
rebuildRequestIndex();

function mintId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`;
}

function send(res, status, doc) {
  const body = JSON.stringify(doc);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
    const path = url.pathname;

    if (req.method === "GET" && path === "/") {
      // FYD-037: journal identity assertion. `journal` is live-derived
      // (see JOURNAL_MARKER); `service` + `store` are kept for existing
      // readers. The main PING journal asserts its own marker on
      // GET /health (pending the gateway cutover HOLD).
      send(res, 200, {
        ok: true,
        service: "fyd-journal-gateway",
        store: STORE,
        journal: JOURNAL_MARKER,
      });
      return;
    }

    if (req.method === "GET" && path.startsWith("/events/")) {
      const stream = decodeURIComponent(path.slice("/events/".length));
      const limit = Math.max(1, Math.min(10000, parseInt(url.searchParams.get("limit") || "1000", 10) || 1000));
      const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);
      if (stream === "FYD_SITE_OVERLAY") {
        // Tenant enforcement on READ: no tenant context = fail closed.
        const tenant = url.searchParams.get("tenant");
        if (!isValidTenantId(tenant)) {
          send(res, 400, {
            error: "tenant_required",
            detail: "a valid ?tenant=<tenant_id> query param is required to read FYD_SITE_OVERLAY",
          });
          return;
        }
        const all = loadEvents().filter(
          (e) => e.event_type === stream && tenantIdOf(e) === tenant,
        );
        const page = all.slice(offset, offset + limit);
        send(res, 200, { events: page, stream, count: page.length, limit, offset, tenant });
        return;
      }
      const all = loadEvents().filter((e) => e.event_type === stream);
      const page = all.slice(offset, offset + limit);
      send(res, 200, { events: page, stream, count: page.length, limit, offset });
      return;
    }

    if (req.method === "POST" && path === "/events") {
      // Caller verification runs BEFORE any body parsing or store touch:
      // an unverified caller gets a typed DENY with zero writes.
      const authz = req.headers.authorization || "";
      const presented = authz.startsWith("Bearer ") ? authz.slice(7) : "";
      const verified =
        WRITE_TOKEN.length > 0 &&
        presented.length === WRITE_TOKEN.length &&
        timingSafeEqual(Buffer.from(presented, "utf8"), Buffer.from(WRITE_TOKEN, "utf8"));
      if (!verified) {
        send(res, WRITE_TOKEN ? 401 : 503, {
          error: WRITE_TOKEN ? "write_auth_denied" : "write_auth_not_configured",
          detail: WRITE_TOKEN
            ? "POST /events requires Authorization: Bearer <FYD_JOURNAL_WRITE_TOKEN>"
            : "write credential not configured; writes are refused until FYD_JOURNAL_WRITE_TOKEN is set",
        });
        return;
      }
      const raw = await readBody(req);
      let doc;
      try {
        doc = JSON.parse(raw);
      } catch {
        send(res, 400, { error: "invalid JSON body" });
        return;
      }
      const event_type = doc && typeof doc.event_type === "string" ? doc.event_type.trim() : "";
      const event_data = doc && typeof doc.event_data === "object" && doc.event_data !== null ? doc.event_data : null;
      if (!event_type || !event_data) {
        send(res, 400, { error: "event_type (string) and event_data (object) are required" });
        return;
      }
      // Tenant enforcement on APPEND (FYD_SITE_OVERLAY): the envelope's
      // tenant_id is immutable and must agree with aggregate_id and
      // event_data.siteId. A spoofed envelope is refused, never stored.
      const tenant_id = doc && typeof doc.tenant_id === "string" ? doc.tenant_id.trim() : "";
      if (event_type === "FYD_SITE_OVERLAY") {
        if (!isValidTenantId(tenant_id)) {
          send(res, 400, {
            error: "tenant_required",
            detail: "FYD_SITE_OVERLAY events require a valid tenant_id (the site id)",
          });
          return;
        }
        const agg = typeof doc.aggregate_id === "string" ? doc.aggregate_id : null;
        if (agg !== null && agg !== "fyd-site:" + tenant_id) {
          send(res, 400, {
            error: "tenant_mismatch",
            detail: "aggregate_id does not belong to tenant_id",
          });
          return;
        }
        if (event_data.siteId !== tenant_id) {
          send(res, 400, {
            error: "tenant_mismatch",
            detail: "event_data.siteId does not match tenant_id",
          });
          return;
        }
      }
      let requestId = null;
      if (doc.request_id !== undefined && doc.request_id !== null) {
        if (typeof doc.request_id !== "string" || !doc.request_id.trim() || doc.request_id.length > 128) {
          send(res, 400, { error: "request_id must be a non-empty string of at most 128 chars when present" });
          return;
        }
        requestId = doc.request_id.trim();
        const prior = requestIndex.get(requestId);
        if (prior) {
          if (prior.tenantId && prior.tenantId === tenant_id) {
            // Idempotent replay by the same tenant: the original event, no new append.
            send(res, 200, { event_id: prior.eventId, deduped: true });
            return;
          }
          // A different tenant is reusing another tenant's request_id.
          // Reject without disclosing the original event_id.
          send(res, 400, {
            error: "request_id_tenant_conflict",
            detail: "request_id is already bound to a different tenant",
          });
          return;
        }
      }
      const rec = {
        event_id: mintId("fyd-ovl"),
        timestamp: new Date().toISOString(),
        event_type,
        tenant_id: isValidTenantId(tenant_id) ? tenant_id : null,
        aggregate_id: typeof doc.aggregate_id === "string" ? doc.aggregate_id : null,
        aggregate_type: typeof doc.aggregate_type === "string" ? doc.aggregate_type : null,
        event_data,
        request_id: requestId,
      };
      mkdirSync(dirname(STORE), { recursive: true });
      appendFileSync(STORE, JSON.stringify(rec) + "\n", "utf8");
      if (requestId) requestIndex.set(requestId, { tenantId: tenant_id, eventId: rec.event_id });
      send(res, 200, { event_id: rec.event_id, deduped: false });
      return;
    }

    send(res, 404, { error: "not found" });
  } catch (err) {
    send(res, 500, { error: String((err && err.message) || err) });
  }
});

mkdirSync(dirname(STORE), { recursive: true });
server.listen(PORT, HOST, () => {
  console.log(`[fyd-journal-gateway] listening on http://${HOST}:${PORT} store=${STORE}`);
});
