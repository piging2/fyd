# FYD write-boundary P0: idempotent owner actions — design

Branch: `fyd/write-boundary-idempotency` (from `b0cdc3b8`).
Status: DESIGN (not implemented). No live-server changes; :3100 untouched.

## 1. Goal

Owner actions on the FYD write path (`POST /api/fyd/customize`: `approve`,
`clear`) must be safe under the failures that actually happen on this box:
lost responses, tunnel interruptions, double-submits, concurrent approves,
and killed writers.

Contract (Nolan, 2026-09-24):

- Client-generated `request_id` per owner action.
- Canonical payload digest, computed server-side.
- Server idempotency: same ID + same digest → original result, no new event.
  Same ID + different digest → `409 CONFLICT`.
- Scoped lock serializing the re-derive → verify → append sequence per site.
- Optimistic approval precondition (already exists as proposal-equality;
  the lock closes its TOCTOU).
- Lost-response retry, concurrent-mutation, and killed-writer tests.
- `AUTHORIZED → DISPATCHED → SUCCEEDED / FAILED / UNKNOWN` preserved.
  **Timeout never means failed.** No provider executor.
- Diagnostic JSONL stays subordinate to canonical history.

Non-goals: real authentication (demo-owner mode stays conspicuously demo),
changing the journal's event schema for readers, touching the main PING
gateway (:8080, still HOLD), any new database or distributed infra.

## 2. Current write path (as-is, b0cdc3b8)

`handleApprove` / `handleClear` → re-derive proposal from current spec →
verify client proposal byte-equals fresh proposal (409 otherwise) →
`emitOverlayEvent` → `POST http://127.0.0.1:18199/events` →
`tools/fyd-journal-gateway/server.mjs` → `appendFileSync` to
`data/fyd-journal/events.jsonl`.

Gaps:

1. No request identity. A retried approve (lost response, tunnel cut,
   double-click) appends a SECOND event. `directiveIdFor` is deterministic
   so the projection may absorb it, but the journal grows duplicates and
   `clear`+`approve` interleavings are unprincipled.
2. `journal_unavailable` → 502 "NOT recorded" is a lie when the POST
   succeeded but the response was lost. Timeout is currently reported as
   failure — the exact violation the P0 forbids.
3. No serialization: two concurrent approves can both pass the digest check
   and both append.
4. No `/healthz` / `/readyz` on :3100.

## 3. Design

### 3.1 Request identity and canonical digest

- Client sends `request_id` (uuid v4) with `approve`/`clear`. If absent, the
  server mints one per request and returns it; the client MUST reuse it on
  retry. Retried requests reuse the same `request_id`.
- Server computes `payload_digest = sha256hex(canonicalize(payload))` where
  payload is `{action, siteId, text, proposal}` for approve and
  `{action, siteId, intentId}` for clear, using the existing `canonicalize`
  in `@/lib/ping/ask-composer`. The client never supplies the digest; the
  server is the digest authority.

### 3.2 FYD-side idempotency ledger (request lifecycle owner)

`src/fyd/customize/write-boundary.ts` (pure; no `next/server` import so it
stays unit-testable in the lane's jest scope).

- Persistent ledger: `data/fyd-idempotency/ledger.jsonl`, append-only.
  Record: `{request_id, digest, action, siteId, status: "recorded",
  result: {eventId, intentId?, proposalDigest?, specDigest?}, at}`.
  Loaded into memory at first use; corrupt lines skipped (never fail reads).
- Lookup on every mutating request, BEFORE the lock:
  - Hit + same digest → return stored result with `idempotentReplay: true`.
    No journal contact, no new event. (Lost-response retry, fast path.)
  - Hit + different digest → `409 {code: "idempotency_conflict"}`.
    The same ID must never mean two different actions.
  - Miss → proceed under the scoped lock.
- After a successful journal append, append the ledger record, then respond.
  Crash between journal-append and ledger-append is safe: the retry
  re-derives, re-POSTs with the same `request_id`, and the gateway dedupe
  (3.3) returns the ORIGINAL `event_id` — no duplicate event, and the ledger
  is then filled in.

### 3.3 Journal gateway dedupe (single authority for "was it recorded")

`tools/fyd-journal-gateway/server.mjs`:

- `POST /events` accepts optional `request_id`. The event record stores it.
- In-memory index `request_id → event_id`, rebuilt at startup by scanning
  `events.jsonl` (first wins). No separate index file: the event record
  IS the index entry, so there is no two-file atomicity problem.
- On `request_id` hit: return `200 {event_id: <original>, deduped: true}`
  WITHOUT appending.
- This is the backstop that makes crash-recovery correct: any retry that
  reaches the gateway with the same `request_id` converges on the original
  event.

### 3.4 Scoped lock

`acquireSiteLock(siteId)` in `write-boundary.ts`:

- In-process async mutex per site (Map<string, promise chain>): serializes
  the re-derive → verify → append → ledger-record sequence for one
  Next.js server process.
- Plus a lockfile `data/fyd-idempotency/locks/<siteId>.lock` via
  `O_CREAT|O_EXCL`, stale after 60s (mtime), reaped on acquire. Covers the
  dev-overlap case (two servers, one journal).
- PG advisory locks: NOT used. Rationale (recorded for the "prefer ... if
  supported" clause): the FYD app has no `pg` dependency, the demo journal
  is file-based by design, and the standing freeze forbids new database
  infrastructure. The file lock is the honest scoped lock for this
  topology; the decision is revisited only if the write path ever moves
  onto PG-backed infra.

The lock closes the TOCTOU in the existing optimistic precondition: the
client proposal must byte-equal a proposal freshly derived from the
current spec, and derivation+verification+append now happen atomically
per site.

### 3.5 UNKNOWN seam

`emitOverlayEvent` gains an AbortController timeout (10s):

- Preflight failure (identity unreadable/mismatch, connection refused
  BEFORE any POST): `502 journal_unavailable` — nothing was recorded,
  safe to say so.
- POST sent, response lost / timed out / socket destroyed: the effect may
  or may not have happened. Return `504 {code: "unknown_outcome",
  outcome: "UNKNOWN", ...}` with explicit copy: "OUTCOME UNKNOWN —
  RECONCILIATION IN PROGRESS. Retry with the same request_id to resolve."
  Never 502, never "NOT recorded".
- The state machine stays `AUTHORIZED → DISPATCHED → SUCCEEDED / FAILED /
  UNKNOWN`. There is no provider executor; the journal append is the
  effect, and its confirmation is the response.

### 3.6 Liveness / readiness

- `GET /healthz` → `200 {ok: true, service: "fyd"}`. No dependencies.
- `GET /readyz` → runs the journal preflight (reachable + identity
  marker OK) → `200 {ready: true}` or `503 {ready: false, reason}`.

### 3.7 Subordinate diagnostics

`data/fyd-idempotency/diagnostics.jsonl`: append-only, human-readable
lines for replay-served, idempotency-conflict, unknown-outcome,
lock-waited, stale-lock-reaped. Never read for decisions — evidence only.

## 4. API deltas

Request (`approve`): `{action, siteId, text, proposal, request_id?}`.
Request (`clear`): `{action, siteId, intentId, request_id?}`.

Success: `200 {ok: true, ..., eventId, requestId, idempotentReplay?}`.
Replay: same shape, `idempotentReplay: true`, no new event.
Conflict: `409 {ok: false, code: "idempotency_conflict", ...}`.
Unknown: `504 {ok: false, code: "unknown_outcome", outcome: "UNKNOWN",
requestId, ...}`.

Existing codes (`stale_digest`/`proposal_altered` 409, `unresolved` 422,
`journal_unavailable` 502, `demo_owner_mode_required`/`capability_denied`
403) are unchanged.

## 5. File layout

- `src/fyd/customize/write-boundary.ts` — NEW: digest, ledger, site lock,
  diagnostics, UNKNOWN-aware emit wrapper. Pure (no next/server).
- `src/app/api/fyd/customize/route.ts` — MOD: thread `request_id` through,
  ledger lookup before lock, 409/504 branches, return `requestId`.
- `tools/fyd-journal-gateway/server.mjs` — MOD: `request_id` accept,
  dedupe index, `{event_id, deduped}` response.
- `src/app/api/healthz/route.ts`, `src/app/api/readyz/route.ts` — NEW.
- `src/fyd/customize/__tests__/write-boundary.test.ts` — NEW: ledger,
  lock, digest, conflict, replay, unknown-seam (fake journal client).
- `tools/fyd-journal-gateway/__tests__/` — NEW: gateway dedupe, torn-write
  recovery, index rebuild (plain node:http, temp store).
- Hostile-gate script: `tools/fyd-write-boundary/gate.sh` — NEW: drives
  the 12-gate matrix against a scratch stack (temp journal + worktree
  server), prints PASS/FAIL per gate.

## 6. Hostile gate mapping

1. IDEMPOTENT LOST-RESPONSE RETRY → fake journal drops the response after
   recording; retry same `request_id` → original `event_id`, 1 event.
2. SAME REQUEST ID + DIFFERENT DIGEST → 409 `idempotency_conflict`.
3. CONCURRENT APPENDS → N distinct `request_id`s, same site, concurrent →
   N events, all `recorded`, ledger has N entries.
4. UNIQUE SEQUENCES → all `event_id`s unique; exactly one event per
   `request_id`.
5. LOST UPDATES: ZERO → N concurrent approves with the SAME `request_id`
   → exactly 1 event, all callers get the same `event_id`.
6. STALE APPROVAL → old-spec proposal → 409 (existing check, kept).
7. CRASH DURING WRITE → kill -9 gateway mid-append / torn last line →
   journal loads, corrupt line skipped, prior events intact; ledger
   consistent.
8. REPLAY: DETERMINISTIC → rebuild ledger+projection twice from the same
   journal bytes → identical digest.
9. /healthz, /readyz → 200 / 200-or-503-honest.
10. SERVICE RESTART → restart app+gateway → pre-restart `request_id`
    still replays from reloaded ledger.
11. TUNNEL INTERRUPTION → socket destroyed after gateway recorded, before
    client read → client sees UNKNOWN (504) → retry resolves to original
    `event_id`, journal has 1 event.
12. CANONICAL TEST → lane jest suite green.

## 7. Rollout (proven-to-safe chain)

1. Implement on this branch; lane jest suite green.
2. Hostile gate green against scratch stack.
3. Commit (explicit pathspecs), review diff.
4. Merge decision per Nolan's standing rules; test merged state.
5. Deploy to :3100 ONLY via the sanctioned pure-HEAD harvest process, at a
   moment that does not interrupt Nolan's hands-on testing; restart via
   `/home/nolan/start-3100.sh`; verify `/healthz`, `/readyz`, approve path,
   and one live idempotent retry.
6. The journal gateway (`:18199`) is a separate process: its `server.mjs`
   change ships with the same deploy; restart it via its own launcher
   (never via start-3100.sh), verify identity marker and dedupe.

## 8. Open questions (decide at 80%, record)

- None blocking. `request_id` optional-with-server-mint keeps backward
  compat; strict-required can come later if Nolan wants it.
