# PUBLIC SOCIAL DATA FABRIC (FYD harvest lane)

Date: 2026-09-21. Lane: read-only research. Status: HARVEST ONLY, no code built, no infrastructure stood up.

Question: how much of the public social web can FYD understand without scraping private surfaces, bypassing access controls, or becoming dependent on one provider?

Standing boundary for this lane: public sources only, legitimately accessible reads, no DMs, no friends-only content, no rate-limit games, no surveillance graph. Provider data is OBSERVATION. Observation never becomes canonical identity merely because FYD saw it. Identity resolution answers interoperability questions only.

## 0. Method and honesty log

Verified by execution (2026-09-21):
- npm registry probes: `@atproto/api` 0.20.44, `nostr-tools` 2.25.2, `fedify` 0.17.0, `@farcaster/hub-nodejs` 0.17.0.
- PyPI probe: `crawl4ai` 0.9.3 latest.
- X API `/2/users/me` with Nolan's connected OAuth (200): `{id: "1391835973911121920", username: "GeskeNolan", name: "Nolan Geske"}`.
- X API `/2/users/by/username` returns 402 (credits depleted) on this plan.
- GitHub `custom.github` credential returns 401 "Bad credentials" on api.github.com; recorded as FL-20260921-012. Unauthenticated public `api.github.com/users/<login>` reads used instead.
- Repo inspection via Pig bridge: `src/fyd/adapters/ATPROTO-HARVEST.md` (2026-09-21), `src/fyd/adapters/activitypub/*` (webfinger, follow, signing, endpoints, probe-roundtrip), `src/fyd/acquisition/acquisition-adapter.ts` (`AcquiredObservation`), `src/fyd/proceduralize/proceduralizer.ts` (FactClass, ParsedFact, ClaimKind), `src/fyd/resolve/spike/*` (EXACT/AMBIGUOUS/UNMATCHED), `src/fyd/ask/envelope.ts` (sha256-canonical-json-v1), `src/fyd/proceduralize/ACQUISITION-STACK.md` (Crawl4AI 0.9.3 decisions), `src/config/tenant.ping.v1.json` (canonical operator + FB Page URL).
- Read from docs (not executed): Jetstream v2 wire details, Nostr NIP list, Farcaster hub endpoints, ActivityPub/Fedify behavior, Lightpanda architecture. browser_search and browser_open went upstream-unavailable mid-lane (FL-20260921-014); no new web reads after 06:44 MDT. Findings below are labeled.

Benchmarks (Crawl4AI vs Lightpanda vs current stack): HELD per Nolan's FOCUS NOW directive (2026-09-21 ~06:44 MDT). No benchmark runs started by this lane. The trigger is "current stack cannot acquire required evidence" after the structured-data repair; it has not fired. Existing decisions from ACQUISITION-STACK.md (2026-09-21) stand: Crawl4AI 0.9.3 HARVEST design only (Docker server REJECT, LLM extraction REJECT, anti-bot circumvention REJECT), Playwright 1.63.0 HARVEST as L2 engine, no live crawl ever run.

## 1. Source capability matrix

STATUS is exactly one of ADOPT / ADAPT / RESEARCH / REJECT.

### 1.1 ATProto (Bluesky network)

- PUBLIC READ: full, unauthenticated. Public XRPC on any PDS/AppView: `com.atproto.repo.getRecord`, `listRecords`, `app.bsky.actor.getProfile`, `getProfiles`, `app.bsky.graph.getFollows/getFollowers`, `app.bsky.feed.getAuthorFeed` (public posts only). No account needed.
- AUTHENTICATED READ: only needed for private data FYD never wants; skip.
- STREAM: Jetstream (converts the heavier repo stream into ordinary JSON events). Public hosts: `jetstream{1,2}.us-{east,west}.bsky.network`, `wss://<host>/subscribe`. Query params: `wantedCollections` (up to 100, NSID prefixes like `app.bsky.*` supported), `wantedDids` (up to 10,000), `cursor` (unix microseconds). Account and Identity events always delivered regardless of filters. Optional zstd with a custom dictionary (~56 percent smaller). Doc-read (not executed). Caveat from docs: only the Jetstream v2 wire is supported; legacy v1 hosts are frozen. Cursor/resume semantics: time-based cursors make multi-instance resume trivial; rewind a few seconds on reconnect and process idempotently keyed by `(seq, repo, commit/rev)`.
- BACKFILL: `cursor` rewind for recent history; deep backfill via `listRecords`/repo CAR sync (`com.atproto.sync.getRepo`). No mirror-everything policy: targeted only.
- IDENTITY KEY: DID (stable, the only join key). Handle is a human label resolved at read time; it changes. (Already harvested in ATPROTO-HARVEST.md; reaffirmed.)
- PROFILE: `app.bsky.actor.profile` record (displayName, description, avatar/ banner blobs, joinedViaStarterPack).
- POSTS: `app.bsky.feed.post` records; public only.
- RELATIONSHIPS: `app.bsky.graph.follow` records `{subject: DID, createdAt}`; blocks, mutes similarly first-class.
- REACTIONS: `app.bsky.feed.like`, `app.bsky.feed.repost` records.
- REFERENCES: post embeds (images, external links, quote posts), `facets` (mentions, links, tags), starter packs, lists, labeler references.
- DELETIONS: commit `delete` operations on the stream; Tombstone semantics via record removal; Jetstream carries deletes as commit events.
- CURSOR/RESUME: yes, time_us; idempotent reprocessing required.
- RATE LIMIT: public endpoints are generous but uncontracted; Jetstream is explicitly operated for public developer use. Stay targeted; one connection, tight filters.
- TERMS/POLICY CONSTRAINT: public data by protocol design. Bluesky's developer posture encourages public use. FYD policy adds: no bulk person-profiling, no surveillance graph; identity/profile/follow/reference signals only, aggregate or per-explicit-user-neighborhood.
- LIBRARY: `@atproto/api` 0.20.44 (npm, verified; license as published, check at adoption). No new dependency needed for the min subset: plain WebSocket + HTTPS JSON suffices.
- COST: zero marginal cost.
- FYD VALUE: highest of any social source. Stable DIDs, first-class relationship records, server-side filtered stream, strong references (uri + cid) as the receipt shape. The public observation index pattern maps almost 1:1 onto ATProto's own model.
- STATUS: ADOPT (public read + targeted Jetstream subset; never a full mirror, never a PDS).

### 1.2 Nostr

- PUBLIC READ: full, unauthenticated, via any public relay WebSocket (NIP-01 REQ filters: ids, authors, kinds, since/until, tags, limit). Read-only posture: connect, subscribe, close. Never hammer; one relay per check, selected kinds only.
- AUTHENTICATED READ: NIP-42 auth exists for relay-gated reads; FYD does not need gated content.
- STREAM: live subscription per relay (REQ with open-ended filter). No global stream; the "firehose" is per-relay and partial by design.
- BACKFILL: REQ with `since`/`until` windows; replaceable events resolve to latest by relay.
- IDENTITY KEY: public key (secp256k1, bech32 `npub`). Stable. Never a username.
- PROFILE: kind 0 (name, about, picture, banner, website, nip05, lud16).
- POSTS: kind 1 (text notes; replies via `e` tags; NIP-22 kind 1111 comments exist but kind 1 dominates).
- RELATIONSHIPS: kind 3 contact lists (follow graph); kind 10002 relay list metadata (NIP-65, where the user reads/writes).
- REACTIONS: kind 7 (NIP-25).
- REFERENCES: `r`/`t`/`p`/`e` tags, kind 0 `website` field, NIP-89 handler recommendations (kinds 31989/31990), website backlinks.
- DELETIONS: kind 5 (NIP-09) deletion requests; relays honor at their discretion. Deletion is a request, not a guarantee: record as DELETED_IF_OBSERVED, never assume.
- CURSOR/RESUME: `since`/`until` per relay; EOSE marker. No global cursor: per-relay checkpoints.
- RATE LIMIT: relay-defined; conservative single-subscription policy; back off on CLOSE/auth-required.
- TERMS/POLICY CONSTRAINT: relays are independent operators. Respect NIP-11 relay info and relay behavior; treat relay absence as no-data, never as negative evidence. Relay presence is not canonical availability.
- LIBRARY: `nostr-tools` 2.25.2 (npm, verified; pure TS, no native deps). The signed-event primitive (`{id, pubkey, created_at, kind, tags, content, sig}`) maps naturally into a FYD observation: the signature is built-in provenance.
- COST: zero marginal.
- FYD VALUE: high. The event primitive is the cleanest observation envelope of any protocol: content-addressed (id = hash), self-authenticating (sig), globally typed (kind). NIP-05 gives a DNS-anchored identity verification path FYD can reuse; kind 0 `website` plus bidirectional rel=me gives deterministic web-to-Nostr links.
- STATUS: ADOPT (selected public kinds only: 0, 1, 3, 5, 7, 10002, plus kind 0 website/NIP-05; never kind 4 DMs, never bulk).

NIP list used above is long-standing standard (training knowledge; re-verify against the NIPs repo at build time): NIP-01 events/filters, NIP-02 follows, NIP-05 DNS identifiers, NIP-09 deletion, NIP-11 relay info, NIP-19 bech32, NIP-22 comments, NIP-25 reactions, NIP-33 parameterized replaceable, NIP-42 auth, NIP-46 remote signing, NIP-57 zaps, NIP-65 relay lists, NIP-78 app data, NIP-89 handlers. Doc-read, not executed.

### 1.3 ActivityPub / Mastodon

- PUBLIC READ: WebFinger (`acct:user@domain`, RFC 7033), Actor documents, outbox collections, public posts (`to: https://www.w3.org/ns/activitystreams#Public`), Follow/Like/Announce semantics, instance public timelines where exposed. Federation itself exposes public object graphs; do not assume every instance exposes a public timeline.
- AUTHENTICATED READ: not needed for public harvesting.
- STREAM: none standard. Poll outboxes (ordered collections, paged) or instance timelines where offered.
- BACKFILL: outbox paging; instance-dependent depth.
- IDENTITY KEY: Actor URI (stable per account; moves are explicit Move activities).
- PROFILE: Actor (name, summary, icon, attachments incl. PropertyValue fields often carrying rel=me links).
- POSTS: public Notes/Articles via outbox.
- RELATIONSHIPS: Follow activities; followers/following collections.
- REACTIONS: Like, Announce (boost).
- REFERENCES: mentions, hashtags, attachments, alsoKnownAs.
- DELETIONS: Delete activities, Tombstones.
- CURSOR/RESUME: outbox page cursors; no global resume token.
- RATE LIMIT: instance-defined; Mastodon default 300 req/5min per token or IP. Poll gently; honor instance rules and blocks.
- TERMS/POLICY CONSTRAINT: each instance is its own jurisdiction with its own rules and defederation posture. FYD treats the instance as the policy authority for its data. Standing directive: ActivityPub stays frozen; this harvest is research only, no new lane.
- LIBRARY: `fedify` 0.17.0 (npm, verified). Eliminates commodity work: WebFinger client, HTTP signatures, activity builders, inbox/outbox plumbing. The repo already carries a hand-rolled TS adapter (`src/fyd/adapters/activitypub/`: webfinger, follow, signing, endpoints, probe-roundtrip with throwaway keys on `probe.invalid` so no real relationship is ever created). Fedify would replace the hand-rolled signing/serialization, not the policy layer.
- COST: zero marginal.
- FYD VALUE: medium. The graph semantics are the richest (Follow is a real object), but per-instance variance is the highest and there is no global stream. Best harvested as patterns: WebFinger-first identity, Actor attachments as rel=me evidence, outbox polling with page cursors.
- STATUS: ADAPT (patterns and Fedify for commodity protocol work when the lane unfreezes; lane frozen per 2026-09-21 directive).

### 1.4 Farcaster

- PUBLIC READ: yes via public hub HTTP APIs. Cheapest legitimate path: a public hub's HTTP API (e.g. Pinata's public hub, read-only, no key) or the documented curl patterns against any reachable Snapchain/hub. Endpoints: `GET /v1/userDataByFid`, `/v1/castsByFid`, `/v1/castsByParent`, `/v1/linksByFid?link_type=follow`, `/v1/linksByTargetFid`, `/v1/reactionsByCast`. Doc-read, not executed.
- AUTHENTICATED READ: not needed for public reads. Writes need signers; FYD never writes from this lane.
- STREAM: hub event stream over gRPC (requires hub access); Snapchain is the consensus layer (Malachite BFT; HTTP 3381, gRPC 2283 on hub hosts per current docs). No cheap public firehose equivalent to Jetstream.
- BACKFILL: paged queries by FID.
- IDENTITY KEY: FID (numeric; onchain IdRegistry on OP Mainnet). fnames are labels, like handles: resolve at read time.
- PROFILE: UserDataAdd (PFP, display name, bio, URL, username).
- POSTS: CastAdd (up to 1024 bytes, 2 embeds, mentions, parent for replies/channels).
- RELATIONSHIPS: LinkAdd/Remove (`follow`).
- REACTIONS: ReactionAdd/Remove (like, recast).
- REFERENCES: embeds, channel parentUrls, VerificationAddEthAddress (ETH address links).
- DELETIONS: CastRemove, ReactionRemove, LinkRemove. Storage-rented (5,000 casts per unit); old data can age out: absence is not deletion evidence.
- CURSOR/RESUME: page tokens.
- RATE LIMIT: hub-defined; public hubs are a shared courtesy. Query by known FIDs only; no sweeping.
- TERMS/POLICY CONSTRAINT: hub operators' terms; Neynar's managed API needs a key and is a vendor dependency. FYD prefers the protocol path over the vendor path.
- LIBRARY: `@farcaster/hub-nodejs` 0.17.0 (npm, verified version only; native protobuf/gRPC weight not inspected). Lighter path: plain HTTPS to a public hub's REST surface, no SDK.
- COST: zero via public hub courtesy; Neynar tiered if a vendor path is ever chosen (not recommended).
- FYD VALUE: medium-low for FYD's market today (home-service trades are not on Farcaster), but the read path is cheap and the identity model (FID + signed messages) is clean. Revisit only if a customer segment materializes.
- STATUS: RESEARCH (read path identified; no infrastructure, no SDK adoption, no box-checking).

### 1.5 Open web: RSS/Atom, Webmention, WebFinger, rel=me, sitemaps, JSON-LD, OpenGraph, schema.org, contact/about/team pages

- PUBLIC READ: full. The boring open web is the highest-evidence-per-byte surface FYD has: `sameAs` and `rel=me` are deterministic identity claims authored by the site owner.
- STREAM: RSS/Atom polling; conditional GET (ETag/Last-Modified) is the cursor.
- BACKFILL: feed archives, sitemaps.
- IDENTITY KEY: canonical URL / domain.
- EVIDENCE TYPES: JSON-LD `Organization.sameAs` (owner-authored cross-links to social profiles), `rel=me` bidirectional links (the only widely deployed bidirectional identity proof on the open web), WebFinger for non-AP indie identity (RFC 7033 is protocol-agnostic), author links, canonical links, contact/about/team pages (phone, email, hours, staff names).
- DELETIONS: feed item retraction is weak; treat as SUPERSEDED, not deleted.
- RATE LIMIT: site-defined; FYD policy already requires robots.txt with no off switch (ACQUISITION-STACK.md), per-domain pacing, size caps, no credentialed URLs, no private networks.
- LIBRARY: already in repo: fast-xml-parser pinned 5.11.1, feed parser emitting `feed_item` claims with GUID provenance, structured-data extractor (STRUCTURED-DATA.md). Webmention is inbound-verification, not a harvest source: accept mentions, verify by fetching the source, never trust the notification alone.
- FYD VALUE: highest leverage. Every deterministic identity edge FYD can draw starts here: sameAs, rel=me, WebFinger, canonical domain. Social profiles are leaves; the website is the root the owner controls.
- STATUS: ADOPT (already partially implemented; extend with rel=me verification and sameAs harvesting).

### 1.6 X API (identity anchor only, not a harvest source)

- The connected OAuth is Nolan's own account; `/2/users/me` is free and works (verified 2026-09-21). `/2/users/by/username` is paywalled (402, FL-20260921-013).
- STATUS: REJECT as a public harvest source (metered, single-provider dependency, hostile automation terms). Retain only as an authorized owner-connected anchor: when Nolan connects his X account, FYD may read his own profile as an identity claim. Never scrape X.

### 1.7 Facebook Graph (not a harvest source)

- STATUS: REJECT as a harvest surface (login walls, Meta ToS, Pig-only session constraint). The PING Social Page remains the outreach home base per standing directive, and the Page URL recorded in Nolan's own tenant config is usable as an owner-authored identity claim (see section 5). No scraping, no Graph crawling.

### 1.8 GitHub API (identity anchor)

- Public `users/<login>` reads work unauthenticated (verified 2026-09-21 for three copilot bot identities; all name None, 0 repos: machine accounts, correctly UNMATCHED). The connected `custom.github` credential is 401 (FL-20260921-012; repair is out of lane).
- STATUS: ADAPT as an identity anchor: public profile `blog` field and profile README links are owner-authored cross-links. Use unauthenticated public reads only; repair the credential through the owning lane before any authenticated use.

## 2. Observation envelope (PING-first)

Searched PING for an existing compatible envelope before designing. Findings:

- `AcquiredObservation` (`src/fyd/acquisition/acquisition-adapter.ts`): the closest existing envelope. Fields: url, finalUrl, fetchedAt, statusCode, contentType, bytes, truncated, levelUsed, depth, title, meta, openGraph, jsonLd, canonicalUrl, links, policyNotes, evidenceHash (hash of raw bytes), escalation. Web-shaped; no source_object_id, no source_actor_id, no cursor.
- `ParsedFact` + `FactClass` (`src/fyd/proceduralize/proceduralizer.ts`): DIRECT_FACT / DERIVED_FACT / INFERENCE / GENERATED_COPY / USER_OVERRIDE grading; visibility tagging with fail-closed private handling. This grading is the honesty mechanism the social envelope inherits.
- `ClaimKind` website_statement | feed_item with GUID provenance: the precedent for per-source claim typing.
- Resolve spike `Provenance` (`src/fyd/resolve/spike/types.ts`): candidateId, corpusRef, mechanism, evaluatedAt, normalizerVersion. Deterministic, versioned, reviewer-visible.
- Ask signing envelope (`src/fyd/ask/envelope.ts`): pinned serializer sha256-canonical-json-v1; payload_hash over canonical bytes. The digest law for the new envelope.
- ATProto harvest: strong reference discipline (uri + cid; never cite a remote record by URI alone) and TID-pattern sortable ids (FYD namespace only, never fake at:// URIs).

No existing envelope carries all of (source, source_object_id, source_actor_id, source_type, observed_at, source_created_at, payload_digest, visibility, raw_evidence_ref, cursor/checkpoint, normalization_version). Per the brief, adapt toward the conceptually equivalent envelope rather than inventing blindly. The adaptation, specified here as documentation only (this lane writes no code):

```
PublicObservation {
  observation_id:   string   // TID-pattern sortable id, FYD namespace (adapted ATProto harvest)
  source:           "atproto" | "nostr" | "activitypub" | "farcaster" | "web" | "x" | "github"
  source_object_id: string   // at://did/collection/rkey | nostr event id (hex) |
                             // AP object id URI | farcaster message hash | page URL
  source_actor_id:  string | null  // DID | pubkey hex | actor URI | FID | null (web)
  source_type:      string   // collection NSID | nostr kind | AS type | message type | "webpage" | "feed_item"
  observed_at:      string   // ISO 8601, FYD clock (harvest: AcquiredObservation.fetchedAt)
  source_created_at: string | null // record createdAt (harvest: feed GUID/item dates)
  payload_digest:   string   // sha256 of canonical bytes of the L1 payload
                             // (harvest: evidenceHash + sha256-canonical-json-v1 pin)
  visibility:       "public" // this index admits public only; grading inherited from ParsedFact
  fact_class:       "DIRECT_FACT" | "DERIVED_FACT" | "INFERENCE" | "USER_OVERRIDE"
                             // (harvest: proceduralizer FactClass; INFERENCE never default)
  raw_evidence_ref:{ uri: string, digest: string }  // strong-ref discipline: location + content hash
  cursor:           object | null // {jetstream_time_us} | {relay, since, until} |
                             // {outbox_page} | {hub_page_token} | {etag} (harvest: escalation/policyNotes pattern)
  normalization_version: string  // explicit version (harvest: resolve spike normalizerVersion)
  policy_notes:     string[] // blocks seen, robots directives, truncation (harvest: AcquiredObservation.policyNotes)
}
```

Every field maps to a harvested PING primitive. Nothing here is a new canonical schema for PING core; it is the adapter-boundary observation shape, owned by the harvest lane, versioned explicitly.

## 3. Two layers, never normalize too early

LAYER 1: source observation. Preserves source semantics and provenance byte-for-byte in meaning:
- ATProto: the record as JSON with `$type`, repo DID, rkey, CID. Jetstream event kept with `time_us` and `seq`.
- Nostr: the full signed event including `sig`. The signature IS the provenance; dropping it destroys verifiability.
- ActivityStreams: the AS-JSON object with its `@context`, `id`, `attributedTo`.
- Farcaster: the message with FID, hash, signer, timestamp (Farcaster epoch noted).
- Web: the fetched bytes behind `evidenceHash` plus extracted structured fields.

LAYER 2: PING semantic projection. Only these shapes, each field carrying its L1 digest reference:
- IdentityClaim { stable_id, id_kind: did|pubkey|actor_uri|fid|domain, display, evidence_ref }
- Post { source_object_id, author stable_id, text_digest (never full text warehoused), created_at, evidence_ref }
- Relationship { from stable_id, to stable_id, kind: follow|block|mute, active, evidence_ref }
- Reaction { reactor stable_id, target ref, kind: like|repost|zap, evidence_ref }
- Reference { from object, to uri, kind: mention|link|embed|sameAs|rel_me|website, evidence_ref }

Rules: L2 never invents a field L1 did not carry. L2 never collapses two sources' semantics into one (a Nostr kind 3 contact list and an ATProto follow record are both Relationship projections, but each keeps its source, its evidence, and its own active/inactive semantics: a kind 3 replaceable event supersedes; an ATProto follow is a record that can be deleted). Conflicts stay visible at L2 as competing projections with distinct evidence, exactly like the resolve spike's AMBIGUOUS tier: never silently merged.

Content policy for L2: the discovery index keeps digests, pointers, and freshness, not warehoused text. A discovery index needs identity, relationship/reference, source pointer, digest, freshness. Full text stays at the source behind the evidence ref.

## 4. Identity resolution and the evidence graph

The prize is identity resolution, not content warehousing. Design (documentation only; the resolve spike's EXACT/AMBIGUOUS/UNMATCHED tiers are the decision skeleton):

Evidence candidates, strongest first:
1. Explicit owner connection (Nolan connects his account in FYD): owner-verified.
2. Provider stable id asserted by the owner in an owner-controlled surface (tenant config, website contact page): e.g. tenant.ping.v1.json `contact.facebook`.
3. DID / pubkey / actor URI / FID as cryptographic or protocol-stable identifiers.
4. Verified domain: NIP-05, ATProto handle DNS/TXT verification, WebFinger.
5. Bidirectional rel=me (site links to profile, profile links back to site).
6. schema.org sameAs authored on the owner's site.
7. Website backlink from the social profile (bio URL field).
8. Provider account claim (display name, bio text): weakest, never sufficient alone.

Decision tiers (harvest: resolve spike):
- EXACT: deterministic rule fires (exact stable id, exact verified-domain match, exact bidirectional rel=me, exact owner-authored URL match). Merge allowed. Evidence named in the decision.
- AMBIGUOUS: scored candidates, never auto-merged; reviewer (human or model) decides with per-feature evidence visible.
- UNMATCHED: stays separate. UNMATCHED is a first-class state, not a failure. The GitHub copilot bot identities in section 5 are UNMATCHED: real accounts, no evidence linking them to Nolan, correctly not merged.

Identity evidence graph: one PING identity node with CLAIM edges to each external anchor. Edge schema:
```
ClaimEdge { from_identity, to_anchor, anchor_kind, source, evidence,
            observed_at, verification_method, status }
```
status in CONFIRMED | CLAIMED | UNVERIFIED | DISPUTED | REVOKED. Verification methods: owner_asserted, bidirectional_rel_me, dns_verified, nip05_verified, provider_signed, exact_url_match, exact_name_canonical, none.

Correction-loop precedence (preserved as distinction, NOT constitutional yet, per brief): owner-verified > signed/verified source > direct structured observation > derived observation > AI inference. FactClass already encodes this on the extraction side; the graph records the precedence class per edge so a future constitutional rule has the data.

OBSERVE/ACT separation: reading public data never implies write authority. Any provider action (follow, post, DM) requires a connected account plus a FydGrant (message.send, provider.call, etc.), plus policy, plus possibly approval. The probe-roundtrip pattern (throwaway keys, unresolvable actors, expected rejection) is the template for any future write-path testing: prove the boundary, never touch a real account.

## 5. Multi-source entity proof (executed, public/authorized data only)

Entity: the operator identity behind PING Social, Nolan Geske. Three legs, executed 2026-09-21.

Leg A: X API `/2/users/me` (authorized OAuth read, Nolan's own account, observed 2026-09-21 ~06:53 MDT):
`{id: "1391835973911121920", username: "GeskeNolan", name: "Nolan Geske"}`.

Leg B: `src/config/tenant.ping.v1.json` (owner-authored canonical authority, committed in repo):
operator `{name: "Nolan Geske", business: "PING Social", role: "Founder and operator"}`;
contact.facebook `https://www.facebook.com/profile.php?id=61594275542163`.

Leg C: PING Social Facebook Page id `61594275542163` as independently recorded in memory (Nolan's own 2026-09-13 correction that the Page exists; canonical profile.php URL). Public page; not scraped, only the stable id is cited.

Deterministic links (no fuzzy merge, no AI):
1. EXACT name: normalized "nolan geske" (Leg A provider display name) == normalized "nolan geske" (Leg B owner-authored operator record). Mechanism: exact_name_canonical. Evidence: two independent authorities, one owner-authored, one provider-issued. This is the resolve spike's EXACT tier shape: deterministic rule, named evidence, no score.
2. EXACT id: Page id `61594275542163` extracted from the Leg B URL equals the Leg C recorded id, character for character. Mechanism: exact_url_match. The URL is owner-authored; the id is Nolan-confirmed.
3. The tenant config itself is the binding record: one owner-authored document asserts operator name + business + Page URL together.

What the proof demonstrates:
- Sources remain distinct: Leg A (provider API observation), Leg B (repo artifact), Leg C (memory note) are cited separately with their own observed_at and authority. Nothing is blended.
- Evidence remains distinct: each edge carries its own source, evidence string, observed_at, verification method, status.
- Deterministic identity evidence connects them: exact string matches only.
- Conflicts remain visible: X handle `GeskeNolan` (mutable label) is recorded as a label, never as a join key (the ATProto harvest discipline: no mutable display string serves as a join key). The GitHub logins `nolangesk-droid`, `nmgeske`, `piging3` resolve to real accounts with name None and 0 repos; they are UNMATCHED machine identities, recorded and not merged. The X `/2/users/by/username` 402 means bio/URL cross-link evidence could not be pulled; recorded as a gap (FL-20260921-013), not assumed.
- FYD Node uses the combined graph: the identity node exposes all three anchors with per-edge provenance, so Ask FYD can cite the correct source per fact.
- Removing/rebuilding the public index does not destroy canonical state: canonical state is the tenant config, the provider record, and the evidence log. The public index rows derived from them are disposable and rebuildable.

Sidecar evidence file: `src/fyd/harvest/IDENTITY-PROOF-EVIDENCE.json` (raw observation payloads with timestamps; no secrets).

## 6. Public graph index design (disposable, derived, never canonical)

The index is a derived projection, not a database of record. Rows:

```
IdentityRow   { identity_key, id_kind, display, sources[], first_seen, last_seen, last_verified, status }
ObjectRow     { source, source_object_id, source_actor_id, source_type, payload_digest,
                evidence_ref, first_seen, last_seen, source_created_at }
RelationRow   { from_key, to_key, kind, active, source, evidence_ref, first_seen, last_seen }
ReferenceRow  { from_object, to_uri, kind, source, evidence_ref, observed_at }
CheckpointRow { source, scope, cursor, updated_at }   // jetstream time_us, relay since/until, outbox page, hub token, etag
```

Targeted ingestion, demand-driven (never mirror):
1. Seed: user connects a website (owner-verified root).
2. Extract deterministic identity claims: rel=me, sameAs, WebFinger, canonical domain, contact page.
3. Resolve identities (section 4 tiers).
4. Fetch the relevant neighborhood only: profiles of resolved anchors, their follow/reference edges, referenced objects. Then stop.
5. Where a protocol offers a legitimate public stream, consume the minimum useful subset: Jetstream with `wantedCollections` limited to identity/profile/graph/reference signals for watched DIDs; Nostr subscriptions limited to selected kinds for watched pubkeys.

Retention: identity, relationship/reference, source pointer, digest, freshness. No content warehousing, no full text, no indefinite retention. Rebuild procedure: drop all rows, replay from Checkpoints + seeds; canonical state untouched. Disposal is a feature: the index can be thrown away and rebuilt, which is what makes it safe to hold.

Freshness is first class on every row: FIRST_SEEN, LAST_SEEN, SOURCE_CREATED, LAST_VERIFIED, STALE_AFTER (per-source policy), SUPERSEDED_BY (newer observation of the same object), DELETED/REVOKED_IF_OBSERVED (nostr kind 5, ATProto delete commit, AP Delete/Tombstone, Farcaster CastRemove; deletion is observed, never assumed).

## 7. WHY THIS, Ask FYD, and correction precedence

Ask FYD already carries `AskEvidenceRef` (kind, id, label, detail). For public-graph answers, each cited fact renders: source label, observed_at, verification method, and the precedence class (owner-verified / signed-verified / direct-structured / derived / inference). The reader can see why FYD believes it and which source to check. Conflicting projections render side by side with their evidence; the UI never presents a merged "truth" from conflicting sources.

Correction loop: an owner correction enters as USER_OVERRIDE FactClass (already in the proceduralizer), which outranks every observation class. A revoked source claim (deletion observed) marks edges REVOKED but preserves the history: suppression is not deletion. This folds in the KNOWN_PERMANENT invariant (deliverable 10): a suppressed gap reopens when the source changes, expected evidence changes, closure evidence disappears, disposition changes, or a new capability makes the gap solvable. Public index rows carry disposition; the reconciler sees the same lifecycle.

## 8. Privacy and policy boundary

- Public surfaces only. No DMs, no friends-only content, no login bypass, no private APIs, no circumventing rate limits or access controls. Ever.
- No surveillance graph: identity resolution answers "are these two public anchors the same entity" for interoperability, never scoring, never sensitive-trait inference, never mass profiling. The Jetstream min-subset rule and the Nostr selected-kinds rule are the enforcement: FYD subscribes to identity/profile/relationship/reference signals, not person-scale content feeds.
- Per-source policy authorities are respected: instance rules (ActivityPub), relay behavior (Nostr), hub courtesy (Farcaster), robots.txt with no off switch (web), developer-use posture (Jetstream).
- Test identity rule (standing): no fake accounts, no impersonation, no real-person identities for testing. The probe pattern (throwaway keys, unresolvable actors) is the only sanctioned write-path test shape.
- A detected restriction becomes BLOCKED, never an optimization problem (standing platform principle). The X 402 and GitHub 401 in this lane were treated exactly so.

## 9. Failures and gaps

- FL-20260921-012: GitHub credential 401; repair out of lane; NEEDS_NOLAN.
- FL-20260921-013: X username lookup 402; quarantined; `me` works.
- FL-20260921-014: browser_search/browser_open upstream unavailable mid-lane; findings labeled doc-read vs executed; QUARANTINED.
- Honest gaps: Jetstream filter/cursor semantics read from docs, never executed (no stream opened by this lane). Nostr relay behavior, Farcaster hub endpoints, Fedify behavior read from docs/registry, never executed. NIP list from long-standing knowledge, re-verify at build. No Bluesky handle confirmed for Nolan (unsearched after browser loss; do not claim). No live website domain for PING Social yet (tenant domain is null); the "website" leg of future proofs is the repo artifact until the site deploys.

## 10. Verdicts

Highest leverage: the ATProto public-read path plus the open-web identity anchors (rel=me, sameAs, WebFinger). Together they give FYD deterministic, owner-authored identity evidence and a cheap filtered stream for the neighborhood FYD actually cares about, with zero marginal cost and no provider dependency that can be revoked. Nostr is second: the signed-event primitive is the cleanest observation envelope available, and NIP-05 plus kind 0 website fields give the same deterministic web linkage. ActivityPub patterns are harvested and frozen. Farcaster is researched and parked. X and Facebook are rejected as harvest sources and retained only as authorized anchors.

The single most valuable next build (for the product lane, not this one): the disposable public index behind the demand-driven ingestion protocol in section 6, seeded from the website leg of the FYD customer loop, with the section 5 proof as its conformance test: any implementation must reproduce the Nolan/PING Social identity graph from the same three legs, keep every edge's provenance, and survive a full index drop and rebuild without losing canonical state.
