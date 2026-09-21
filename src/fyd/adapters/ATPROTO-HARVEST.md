# ATProto Harvest (FYD Social)

Date: 2026-09-21. Status: HARVEST ONLY.

Per Nolan's 2026-09-21 directive ("Do NOT write another adapter skeleton
merely to say we have two"), this document contains no executable adapter
code. It records what ATProto got right, what FYD should take, and what it
should leave alone, with one verdict per primitive: ADOPT (take as-is into
FYD), ADAPT (take the pattern, reshape for FYD), REJECT (do not take).

The core boundary this harvest respects: core knows Actor, Object,
Relationship, Evidence, Capability, Transition. Adapters know provider
specifics. Nothing below moves a provider domain model into core.

## 1. What was searched in PING

Current code, dormant code, and full git history (`git log -S`, `git grep`
across all branches) for: atproto, lexicon, did:, bsky, plc, com.atproto,
app.bsky, strongref/strongRef, rkey, feed generator.

Findings:

- No ATProto-shaped code exists anywhere in PING, current or dormant. No
  prior adapter attempt, no vendored lexicons, no DID handling.
- The only "lexicon" hits are the VADER sentiment lexicon in
  `src/lib/sentiment/` (unrelated, false positive).
- One live prior harvest: `src/lib/ping/grants.ts` line 9 already encodes an
  ATProto permission-pattern harvest ("resource-scoped strings, attenuation
  by default, and human-readable permission sets that expand to exact
  granular grants at consent time"). The permission primitive below is
  marked ADOPT with that lineage recorded, not re-harvested as new.

## 2. Sources reviewed

- `@atproto/api@0.20.44` installed on the build box: ESM-only
  (`"type": "module"`), exports `Agent`/`AtpAgent`, generated lexicon
  namespaces, and lexicon record types. Verified from the installed
  `dist/client/types/app/bsky/graph/follow.d.ts`: `AppBskyGraphFollowRecord`
  is `{ $type: 'app.bsky.graph.follow', subject: string (a DID),
  createdAt: string }`.
- ATProto specifications and current community references (web research,
  2026-09-21): lexicon schema rules, the OAuth scope grammar, permission
  sets, repository/record model, identity model.

## 3. Harvest table

### 3.1 Lexicon schema design: ADOPT

ATProto's schema discipline: reverse-DNS namespaced identifiers (NSIDs),
`$type` self-labeling on every record, shared `*.defs` modules, lowerCamelCase
fields, open unions and `knownValues` over closed enums, and hard evolution
rules (new fields must be optional, types never change, no field renames;
lexicons published as `com.atproto.lexicon.schema` records; PDS validates
optimistically). FYD's own canonical objects (`ping.social.*` schemas) need
exactly this: a compatibility contract that lets the object graph evolve
without a central registry or a flag day. Adopt the conventions for FYD
schema authoring, including the evolution rules as a lintable checklist.

### 3.2 Strong references (uri + cid): ADOPT

`com.atproto.repo.strongRef` is `{ uri, cid }`: a location plus a content
hash. This is the receipt shape FYD's provider boundary already needs.
An ATProto follow receipt IS a strong reference (`at://did/...` plus the
record CID), which means the generalized ExecutionReceipt (provider,
actionKind, receiptUri, content hash) can be specified once and satisfied
by every content-addressed provider. Adopt for receipts and for Evidence
references to external records: never cite a remote record by URI alone.

### 3.3 Record shapes (profile / post / like / follow): ADAPT

The shapes are small and instructive: a follow is `{ subject: DID,
createdAt }`; a like is `{ subject: strongRef, createdAt }`; a post is
`{ text, createdAt, ... }`; a profile is display fields only. The pattern
worth taking is that relationships are first-class records with timestamps,
which maps cleanly onto FYD's Relationship (active/inactive) with
provenance. But the types themselves stay at the adapter boundary: core
never imports `AppBskyGraphFollowRecord` or any provider domain model.
Adapt as the mapping reference for future adapter work, never as core types.

### 3.4 Record keys (rkeys, TIDs, at:// addressing): ADAPT

Record keys are usually TIDs (timestamp-sortable, collision-resistant), and
every record is addressable as `at://did/collection/rkey`
(authority/collection/key). FYD already has `ping:object:` reference ids;
the TID pattern is worth adapting for FYD's own receipt and relationship
ids (sortable, uncoordinated issuance). Do not adapt the scheme itself:
FYD must never mint fake `at://` URIs for non-ATProto things. Take the
pattern (self-describing, sortable keys), not the namespace.

### 3.5 Identity separation (DID vs handle): ADOPT

The rule is absolute in ATProto and should be absolute in FYD: the DID is
the stable identifier and the only thing ever stored as a foreign key;
the handle is a human label resolved at read time and it changes. FYD's
identity-backed objects already center on an identity id; adopt the
discipline explicitly: no mutable display string (handle, username, page
name) may serve as a join key in FYD stores or receipts. Resolution
(handle to stable id) happens at the boundary, at read time.

### 3.6 OAuth granular permissions and permission sets: ADOPT (lineage: grants.ts)

ATProto's scope grammar is `resource:positional?param=value` over five
resources (`repo:`, `rpc:`, `blob:`, `account:`, `identity:`), e.g.
`repo:app.bsky.feed.post?action=create`. `include:<nsid>` references a
published permission-set lexicon: a human-readable bundle the auth server
expands into exact granular grants at consent time, and a set may only
reference resources inside its own NSID hierarchy (attenuation by
construction). This is the model for FYD's capability/permission check
stage in the provider boundary: human-readable bundles, exact granular
grants, attenuation by default, never implied. `src/lib/ping/grants.ts`
already encodes this harvest ("site.propose never implies site.publish").
This document records the lineage so the next harvest does not re-derive
it: the permission primitive is ADOPTED and already landed.

### 3.7 Feed generators: REJECT (for now)

A feed generator is an ATProto distribution mechanism: a service exposing
`app.bsky.feed.getFeedSkeleton`, consuming the firehose
(`com.atproto.sync.subscribeRepos`), with the AppView doing the indexing.
FYD has no firehose consumer and no AppView role, so there is nothing to
attach this to. The adjacent idea (a declarative named query over the
object graph, i.e. a "feed" as a saved lens) is already covered by FYD's
own discovery-feed work and does not need the ATProto machinery. Revisit
only if FYD ever publishes algorithmic feeds to Bluesky itself.

### 3.8 @atproto/api usage pattern: ADAPT

The official SDK (`@atproto/api@0.20.44`) is ESM-only, which the CJS
ts-jest lanes cannot load (verified failure, see FAILURE_LEDGER.md
2026-09-21 ~06:28 MDT entry: `SyntaxError: Cannot use import statement
outside a module` from the SDK's dist). The adapted pattern, proven
against the installed tree: use the SDK's generated lexicon types at
compile time (`import type`, fully erased, so the wire shape stays
checked against the canonical schema) and plain fetch for the XRPC calls
at runtime, or run SDK-touching code in an ESM-capable lane (tsx).
Do not fight the module system with transform hacks; the boundary is
types-in, fetch-out.

## 4. ActivityPub status correction (P6 FROZEN)

Record, verbatim for the file:

- Adapter exists at `src/fyd/adapters/activitypub/` (commit f61200c).
  Mapping tested (9 deterministic tests). One real remote round-trip
  attempted against activitypub.academy; the remote rejected it as
  designed (the signing actor lived on probe.invalid, so no follow
  relationship was created, no account touched, no human notified);
  the rejection arrived as a typed error. No canonical contamination:
  FYD core types untouched.
- Status: LOCAL MAPPING = VERIFIED, REMOTE INTEROP = PARTIAL,
  REMOTE REJECTION HANDLING = VERIFIED.
- Never label the live round-trip "successful": the remote rejected it.
  What was verified is that OUR boundary behaved (typed rejection, no
  mutation, no credential use, nothing persisted).
- Expansion returns only after the product loop is green.

## 5. What this harvest does not do

No adapter code. No new dependencies for harvest purposes. No FYD core
changes. The uncommitted ATProto adapter draft from the stopped lane is
not part of this commit and is reported separately, not committed.
