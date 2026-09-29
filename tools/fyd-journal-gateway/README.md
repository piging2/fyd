# FYD Journal Gateway (restored 2026-09-24)

Standalone demo journal server on `127.0.0.1:18199` for the Ask FYD wired
read path (`PingObjectReader.queryFydSiteOverlays` in the :3100 FYD site
server, `FYD_JOURNAL_GATEWAY_URL` default).

## Why it exists

The reader expects a *separate deployment* from the main PING gateway for
the FYD demo journal (`GET /events/FYD_SITE_OVERLAY`, no auth). No server
code for it existed anywhere and nothing had ever listened on 18199; the
only prior contract was the ask-lane test stub
(`src/app/api/fyd/ask/__tests__/stub-journal.ts`). This directory implements
that contract for real, backed by an append-only JSONL store.

## Layout (on the Pig)

- `/home/nolan/projects/ping/tools/fyd-journal-gateway/server.mjs` - the server (node builtins only)
- `/home/nolan/projects/ping/tools/fyd-journal-gateway/start.sh` - idempotent start
- `/home/nolan/projects/ping/tools/fyd-journal-gateway/gateway.log` - runtime log
- `/home/nolan/projects/ping/data/fyd-journal/events.jsonl` - the journal store

## Provenance of the seed data

The original demo journal was lost before this gateway was built. The 7
seeded `happy-place` overlay events are transcribed (ops + timestamps
verbatim) from the ask-lane test stub, whose header documents them as
mirroring the 7 real overlay events from the FYD demo journal. Seeded ids
are minted (`fyd-seed-ovl-*`); originals are unrecoverable. The ops keep
their own honest labels (`approvedBy: "demo-owner (seeded, unverified)"`).

## Endpoints

- `GET /` - health: `{ ok: true, service }`
- `GET /events/FYD_SITE_OVERLAY[?limit=&offset=]` - journal-ordered events
- `POST /events` - append `{ event_type, aggregate_id?, aggregate_type?, event_data }`, returns `{ event_id }`

## Restart

```bash
bash /home/nolan/projects/ping/tools/fyd-journal-gateway/start.sh
```

No auto-restart is configured; if the Pig reboots, run the command above.
(The main PING gateway on :8080 is NOT a substitute: it requires
`Authorization: Bearer <api_key>` on every route and the reader sends no
auth. Pointing `FYD_JOURNAL_GATEWAY_URL` at :8080 would need a reader code
change to add the header; this gateway avoids that.)
