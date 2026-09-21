# FYD Read-Surface Inventory (archaeology, 2026-09-21)

Nolan's directive: no new FYD endpoints until the existing read surfaces are
inventoried and the boundary is decided. This doc is that inventory plus the
boundary recommendation. It covers the website repo
(`/home/nolan/projects/ping`, branch `fyd/sitespec-generator`) and the live
PING gateway beside it.

## 1. Layer map (the boundary)

```
FYD UI (browser)
  -> BFF routes (Next.js, src/app/api/ping/*, src/app/api/fyd/*)
    -> PingObjectReader (src/lib/ping/ping-object-reader.ts: the ONE governed read authority)
      -> live gateway GET /events/:stream (credential held server-side only)
      -> website-derived projections (merged at read time, never journal writes)
        -> canonical journal / projections (gateway + postgres)
```

Raw journal semantics (event envelopes, canonical hashes, witness data,
signatures, journal cursors/sequences, signing keys) never cross the
PingObjectReader boundary into the UI. The reader returns `PingObject`,
`PingRelationship`, `CapabilityPlan`, `AskAnswer`: sanitized, visibility-
filtered, evidence-labeled projections.

## 2. Inventory

### 2a. BFF routes (FYD UI may call these; nothing else)

| Surface | Path | Returns | R/W | Reuse recommendation |
|---|---|---|---|---|
| Resolve object | `GET /api/ping/object?id=` | `{ object: PingObject }` (sanitized; private visible to controller only) | R | REUSE as-is |
| Resolve node | `GET /api/ping/node?id=` | `{ node: NodePayload }`: object + relationships + related objects + controller + capability plan | R | REUSE as-is; this is the "related objects" surface |
| Available actions | `GET /api/ping/actions?objectId=` | `{ plan: CapabilityPlan }` (pure action-planner; same plan drives UI and agents) | R | REUSE as-is |
| Ask PING | `POST /api/ping/ask` `{question, targetObjectId?}` | `AskAnswer` (evidence-backed; honest partial when no evidence) | R | REUSE as-is |
| Ask FYD | `POST /api/fyd/ask` `{question, targetObjectId?, siteId?}` | `AskFydAnswer` (object graph + SiteSpec summary + evidence + capabilities) | R | REUSE as-is; the FYD flavor of ask |
| Discovery feed | `GET /api/ping/feed?limit=&offset=` | `{ items: DiscoveryFeedItem[], gatewayAvailable }` (deterministic rank; website-derived fallback, nothing faked) | R | REUSE as-is |
| Circle card | `GET /api/ping/circle?identityId=` | `{ circle: IntelligentCircleData }` (public fields only) | R | REUSE as-is |
| Proposal submit | `POST /api/ping/proposal` `{proposal}` | `{ eventId }` (digest re-verified server-side; owner-only; signed envelope) | W | REUSE as-is; the ONLY write path. Agents propose, owners publish |

### 2b. PingObjectReader methods (BFF-internal; the governed read path)

`listIdentities, getProfile, getFeed, getObject, listObjects({schema,limit}),
getRelationships({subject,predicate,object}), getCircleCard, getDiscoveryFeed,
planActions, getNode, ask, submitProposal`. Writes go only through
`submitSignedEvent` (proposal route). Reads go only through `queryEvents`
(`GET /events/:type`). `visibleTo()` enforces private-object visibility per
viewer; `sanitizeFields()` strips signatures, keys, tokens, claims, and other
non-public material. Website-derived objects merge at read time only
(`website-objects.ts`: provenance.kind `website-derived`, never journaled).

### 2c. Gateway HTTP (server-side only; auth-gated at the edge)

`GET /health`, `GET /api/stats`, `GET /events/:stream`,
`GET /events/recent|stats|unprocessed`, `GET /events/:eventId/children|
descendants|ancestors`, `GET /events/correlation/:correlationId`,
`POST /events` (signed canonical envelopes), `POST /events/processed|failed`.
Direct reads without credentials are denied (`MISSING_AUTH` on :8080 and the
RC gateway :18099). The website BFF holds gateway access server-side; the
browser never sees it.

### 2d. Pure lib modules (reusable logic, no I/O)

`action-planner.ts` (CapabilityPlan rules), `grants.ts` (FYD user-facing grant
authority; deliberately separate from the executor CapabilityAuthority),
`feed-rank.ts` (deterministic ranking), `ask-composer.ts`,
`website-objects.ts`. New FYD read logic belongs here or in `src/fyd/`,
never inline in a route.

### 2e. Searched but not a read surface

`/home/nolan/ping/CascadeProjects/infra/ui-next` is a separate CRX UI
spec/build tree; no FYD read APIs found there. No full-text search index
exists anywhere in the website repo or the gateway routes above.

## 3. Gap analysis (FYD UI needs vs. what exists)

- **Search objects: NO dedicated surface.** `listObjects` + client-side
  filtering is the only current mechanism. Constitutional Patch 03
  (`CONSTITUTIONAL_PATCH_03_SEARCH_IS_PROJECTION.md`) governs this:
  search is a projection, never an authority; it must reflect truth
  accurately, preserve constitutional ordering, and support verification.
  Any future search surface must be a deterministic read-only projection
  over the reader (never a journal query that reorders or hides truth).
- **Resolve object: EXISTS** (`/api/ping/object`, `/api/ping/node`).
- **Related objects: EXISTS** (`NodePayload.related`, `getRelationships`).
- **Evidence: EXISTS** (`ObjectProvenance`, `AskEvidenceRef`,
  `sitePatchDigest` binding). Raw envelopes stay below the reader.
- **Available actions: EXISTS** (`/api/ping/actions`, pure planner).

## 4. Boundary recommendation

**Adopted boundary: FYD UI -> sanitized BFF/object reader ->
projections/evidence -> canonical history underneath.**

1. The FYD UI calls BFF routes only. No route talks to the gateway
   directly; all reads flow through `getPingObjectReader()`.
2. New FYD read needs (e.g. search-as-projection) are NEW thin routes under
   `src/app/api/fyd/` whose logic lives in pure, unit-tested modules under
   `src/fyd/` (lane-scoped jest configs, e.g. `src/fyd/ask/jest.config.cjs`
   pattern). Thin route = parse params, call reader, shape response.
3. New reader methods, if ever needed, go in `ping-object-reader.ts` (single
   read authority). Never a second reader, never raw `fetch` to the gateway
   from a route.
4. Never expose to the UI: event envelopes, canonical bytes/hashes, witness
   records, signatures, journal sequences/cursors, private keys, the gateway
   credential. Sanitization stays in the reader, not in each route.
5. Vocabulary discipline: core knows Actor, Object, Relationship, Evidence,
   Capability, Transition. FYD/provider concepts (SiteSpec, `feed_item`
   claims, website-derived objects, ATProto/ActivityPub adapters) live in
   the FYD projection/adapter layer (`src/fyd/`), never in core.
6. Writes stay on the existing proposal path (digest-bound, owner-approved,
   signed envelopes). No new write surfaces without Nolan's explicit call.

**Reuse / wrap / new placement:** REUSE the eight routes in 2a as-is. WRAP
reader methods in new `src/app/api/fyd/` routes for new UI needs. NEW code
only as pure modules under `src/fyd/` or, for read-authority changes, inside
`ping-object-reader.ts`.

## 5. Leg assessment (browser -> website/BFF -> live gateway -> journal -> projection -> website)

Proven live this session against the running website (`:3102`, this repo)
and gateways (`:8080`, `:18099`):

- Browser -> website/BFF: proven over HTTP (200 + JSON from `/`, from
  `/api/ping/object`, from `POST /api/fyd/ask`).
- Website/BFF -> live gateway -> journal -> projection -> website: proven
  for the READ path. `POST /api/fyd/ask` with a bogus `targetObjectId`
  returned `404 {"code":"OBJECT_NOT_FOUND"}`: the BFF reached the gateway,
  the gateway queried the journal, the projection ran, and the typed error
  came back through the BFF. (No browser automation was used; curl stood in
  for the browser over the same HTTP interface.)
- Direct gateway journal reads are auth-gated (`MISSING_AUTH`); the website
  holds access server-side, which is exactly the boundary in section 4.

Not proven / not attempted (per the directive, no new endpoint was added):

- A real browser driving the FYD UI (no browser lane in this task).
- The write leg for any new surface (nothing new was added to write).
- Search-as-projection (specified by Constitutional Patch 03, not built).
- Feed acquisition running against the live gateway (feed parser is
  proceduralize-lane pure code with unit tests; no ingestion was attempted,
  and the gateway write path was not touched).

## 6. Honest gaps

- No full-text search index exists; a future search surface must be built
  as a deterministic projection per Constitutional Patch 03, or not built.
- `src/app/*` and `src/config/*` currently carry another lane's dirty
  website work; this doc and the feed-parser lane add only new files plus
  the minimal `proceduralizer.ts` wiring, and stage explicitly.
- `proceduralizer-repairs.test.ts` (sibling fail-first tests) appeared and
  was removed during this session; the `@graph`/tier repairs remain that
  lane's work. The feed early-return in `parse()` is orthogonal and keeps
  the "<title> regex never fires on XML feeds" property true.
- `package.json`/`package-lock.json` now declare `@atproto/api 0.20.44`
  (a sibling lane had it installed but undeclared; npm re-surfaced the
  drift during this work) alongside this lane's `fast-xml-parser 5.11.1`
  exact pin and the `@unrs/resolver-binding-linux-x64-gnu` optional dep
  (without which jest 30 cannot run at all in this tree).
