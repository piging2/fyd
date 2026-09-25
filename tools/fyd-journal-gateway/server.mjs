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
 *   GET  /events/FYD_SITE_OVERLAY[?limit=&offset=]
 *     -> 200 { events: [ { event_id, timestamp, event_type,
 *                          aggregate_id, aggregate_type, event_data } ],
 *              stream, count, limit, offset }
 *        Events are returned in journal (timestamp ascending) order.
 *        The reader does tenant scoping itself (event_data.siteId), so all
 *        events of the stream are returned.
 *   POST /events
 *     Body: { event_type, aggregate_id?, aggregate_type?, event_data, request_id? }
 *     -> 200 { event_id, deduped }  (the accepted event's id)
 *     Write-boundary P0: when request_id (string, <=128 chars) is present
 *     and was seen before, the gateway returns the ORIGINAL event_id with
 *     deduped:true and appends NOTHING. This is the backstop that makes
 *     lost-response retries and crash recovery converge: any retry that
 *     reaches the gateway with the same request_id gets the original
 *     event instead of a duplicate. The in-memory index is rebuilt from
 *     the store at startup (first record wins), so dedupe survives
 *     restarts. The check -> append -> index-update sequence is
 *     synchronous (no awaits between), so concurrent same-request_id
 *     POSTs cannot both append.
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
import { createHash, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.FYD_JOURNAL_PORT || "18199", 10);
const HOST = process.env.FYD_JOURNAL_HOST || "127.0.0.1";
const STORE =
  process.env.FYD_JOURNAL_STORE ||
  join(HERE, "..", "..", "data", "fyd-journal", "events.jsonl");
const MAX_BODY = 1024 * 1024;

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

function loadEvents() {
  if (!existsSync(STORE)) return [];
  const out = [];
  for (const line of readFileSync(STORE, "utf8").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      /* skip corrupt line, keep serving */
    }
  }
  out.sort((a, b) => String(a.timestamp || "").localeCompare(String(b.timestamp || "")));
  return out;
}

// Write-boundary P0: request_id -> event_id. The event record IS the
// index entry (stored on the record itself), so there is no two-file
// atomicity problem. Rebuilt from disk at startup; updated synchronously
// on every append.
const requestIndex = new Map();
function rebuildRequestIndex() {
  requestIndex.clear();
  for (const e of loadEvents()) {
    if (e && typeof e.request_id === "string" && e.request_id && !requestIndex.has(e.request_id)) {
      requestIndex.set(e.request_id, e.event_id);
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
      const all = loadEvents().filter((e) => e.event_type === stream);
      const page = all.slice(offset, offset + limit);
      send(res, 200, { events: page, stream, count: page.length, limit, offset });
      return;
    }

    if (req.method === "POST" && path === "/events") {
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
      let requestId = null;
      if (doc.request_id !== undefined && doc.request_id !== null) {
        if (typeof doc.request_id !== "string" || !doc.request_id.trim() || doc.request_id.length > 128) {
          send(res, 400, { error: "request_id must be a non-empty string of at most 128 chars when present" });
          return;
        }
        requestId = doc.request_id.trim();
        const prior = requestIndex.get(requestId);
        if (prior) {
          // Idempotent replay: the original event, no new append.
          send(res, 200, { event_id: prior, deduped: true });
          return;
        }
      }
      const rec = {
        event_id: mintId("fyd-ovl"),
        timestamp: new Date().toISOString(),
        event_type,
        aggregate_id: typeof doc.aggregate_id === "string" ? doc.aggregate_id : null,
        aggregate_type: typeof doc.aggregate_type === "string" ? doc.aggregate_type : null,
        event_data,
        request_id: requestId,
      };
      mkdirSync(dirname(STORE), { recursive: true });
      appendFileSync(STORE, JSON.stringify(rec) + "\n", "utf8");
      if (requestId) requestIndex.set(requestId, rec.event_id);
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
