# FYD Journal Gateway (restored 2026-09-24; Postgres backend 2026-10-03)

Standalone demo journal server on `127.0.0.1:18199` for the Ask FYD wired
read path (`PingObjectReader.queryFydSiteOverlays` in the :3100 FYD site
server, `FYD_JOURNAL_GATEWAY_URL` default).

## Why it exists

The reader expects a *separate deployment* from the main PING gateway for
the FYD demo journal (`GET /events/FYD_SITE_OVERLAY`, no auth). No server
code for it existed anywhere and nothing had ever listened on 18199; the
only prior contract was the ask-lane test stub
(`src/app/api/fyd/ask/__tests__/stub-journal.ts`). This directory implements
that contract for real.

## Storage backends (env-selected; same contract on both)

- **JSONL (default):** append-only JSONL at `FYD_JOURNAL_STORE` (default
  `<repo>/data/fyd-journal/events.jsonl`), one event object per line. Node
  builtins only. `request_id` dedupe is a per-process in-memory index
  rebuilt from disk at startup.
- **Postgres:** set `FYD_JOURNAL_PG_URL` (preferred) or `DATABASE_URL` to a
  Postgres connection string and the gateway stores in Postgres behind the
  IDENTICAL HTTP contract (`./pg-store.mjs`). Same code runs against local
  Postgres and later managed Postgres (Neon); only the connection string
  changes. TLS via `?sslmode=require` (or `verify-full`) in the URL.
  `request_id` dedupe is a Postgres partial unique index
  (`UNIQUE (request_id) WHERE request_id IS NOT NULL`), so it is atomic
  across processes, restarts, and instances — this fixes the old
  multi-instance latent where two gateway processes could double-append.
  Idempotent DDL (`CREATE TABLE/INDEX IF NOT EXISTS`; plpgsql only, no
  triggers, no migration framework) runs at boot; the gateway fails closed
  when Postgres is unreachable.

  The PG backend needs this repo's `node_modules` (`pg` is already a
  declared dependency, imported lazily); the JSONL backend needs nothing.

The `GET /` journal identity marker (`fyd-demo-journal@<derived>`) is
live-derived from the selected backing, so emitters and `dump.py`
pre-flights keep working unchanged on either backend.

## Layout (on the Pig)

- `/home/nolan/projects/ping-fyd-converged/tools/fyd-journal-gateway/server.mjs` - the server (HTTP contract; env-selected backend)
- `/home/nolan/projects/ping-fyd-converged/tools/fyd-journal-gateway/pg-store.mjs` - the Postgres backing store
- `/home/nolan/projects/ping-fyd-converged/tools/fyd-journal-gateway/start.sh` - idempotent start
- `/home/nolan/projects/ping-fyd-converged/tools/fyd-journal-gateway/gateway.log` - runtime log
- `/home/nolan/projects/ping-fyd-converged/data/fyd-journal/events.jsonl` - the JSONL journal store (default backend)
- `__tests__/dedupe.test.mjs` - request_id dedupe suite (JSONL backend)
- `__tests__/pg-adversarial.test.mjs` - tenant-isolation adversarial suite (Postgres backend; needs `FYD_JOURNAL_TEST_PG_URL`)
- `__tests__/pg-replay-proof.mts` - reducer replay leg, run by the adversarial suite via the repo's tsx

## Provenance of the seed data

The original demo journal was lost before this gateway was built. The 7
seeded `happy-place` overlay events are transcribed (ops + timestamps
verbatim) from the ask-lane test stub, whose header documents them as
mirroring the 7 real overlay events from the FYD demo journal. Seeded ids
are minted (`fyd-seed-ovl-*`); originals are unrecoverable. The ops keep
their own honest labels (`approvedBy: "demo-owner (seeded, unverified)"`).

## Endpoints

- `GET /` - health + FYD-037 journal identity: `{ ok: true, service, store, journal }`
- `GET /events/FYD_SITE_OVERLAY?tenant=<id>[&limit=&offset=]` - tenant-scoped, journal-ordered events (400 `tenant_required` without `?tenant=`)
- `GET /events/<other-stream>[?limit=&offset=]` - legacy unfiltered shape
- `POST /events` - append `{ event_type, tenant_id, aggregate_id?, aggregate_type?, event_data, request_id? }`, returns `{ event_id, deduped }`.
  Requires `Authorization: Bearer <FYD_JOURNAL_WRITE_TOKEN>` (verified
  before body parsing; 401 when wrong, 503 when unconfigured). Cross-tenant
  `request_id` reuse -> 400 `request_id_tenant_conflict` with zero
  disclosure of the original event_id.

## Tests

```bash
# JSONL backend (default; no env needed)
node --test __tests__/dedupe.test.mjs
# Postgres backend (throwaway database URL required)
FYD_JOURNAL_TEST_PG_URL="postgresql://user:pass@host:5432/db" node --test __tests__/pg-adversarial.test.mjs
```

## Restart

```bash
bash /home/nolan/projects/ping/tools/fyd-journal-gateway/start.sh
```

No auto-restart is configured; if the Pig reboots, run the command above.
(The main PING gateway on :8080 is NOT a substitute: it requires
`Authorization: Bearer <api_key>` on every route and the reader sends no
auth. Pointing `FYD_JOURNAL_GATEWAY_URL` at :8080 would need a reader code
change to add the header; this gateway avoids that.)
