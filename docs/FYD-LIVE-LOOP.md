# FYD Live Acquisition Loop (Track F, 2026-09-25)

The first proven live path from a real source URL to a generated FYD presence:
URL -> DISCOVER -> ACQUIRE -> UNDERSTAND -> RESOLVE -> GENERATE (+ MEDIA).

Intake UI: `/build-my-fyd` -> POST `/api/fyd/build` (SSE stage stream) ->
`/build-my-fyd/<jobId>`.

## Machinery (all existing, composed not replaced)

- DISCOVER: L0 policy gate (shape + DNS public check) reusing `isPublicIp`
  from `@/fyd/net/safe-fetch` (Lane A, the canonical SSRF gate).
- ACQUIRE: `StaticAcquisitionAdapter` in `src/fyd/acquisition/static-adapter.ts`
  implements the pre-existing types-only `AcquisitionAdapter` contract.
  L1 static HTTP goes through `safeFetchPage` (redirects re-validated per
  hop, content-type allowlisted, size-capped, timeout-bounded).
- UNDERSTAND: `proceduralizer.parseRich` (structured-data, OG/meta, title,
  service-card extraction).
- RESOLVE: `proceduralizer` normalize -> provenance -> scopeFields ->
  resolve -> project. Object-builder `verifyObjectGraph` + attestation
  before the planner sees anything.
- GENERATE: `planSite` (binding verifier runs inside it), then
  `validateSiteSpec`.
- MEDIA: Track A `ingestSiteMedia` + `attachMediaToGraph` behind one
  function. Only for explicitly authorized demo tenants.

No new architecture, no new authority classes. The loop composes the
existing object builder, planner, binding verifier, SiteSpec, and media
pipeline.

## Fail closed (typed, never crashes)

`src/fyd/acquisition/errors.ts` defines `AcquisitionFailureCode`:
ACQ_INVALID_URL, ACQ_SCHEME_REJECTED, ACQ_CREDENTIAL_URL, ACQ_PRIVATE_IP,
ACQ_DNS_FAILED, ACQ_HTTP_STATUS, ACQ_REDIRECT_LOOP, ACQ_CONTENT_TYPE_REJECTED,
ACQ_TOO_LARGE, ACQ_TIMEOUT, ACQ_NETWORK_ERROR, ACQ_ROBOTS_DISALLOWED,
ACQ_EMPTY_CONTENT, ACQ_NO_GRAPH, ACQ_VERIFY_FAILED, ACQ_PLAN_FAILED,
MEDIA_RIGHTS_SCOPE. `classifyFetchFailure()` maps safe-fetch reason strings
to codes. Hostile tests live in `src/fyd/acquisition/__tests__/hostile.test.ts`.

## Seams (preserved, not built)

- L2 browser-rendered fallback: NOT implemented. The adapter records the
  L2 consideration as a typed policy note instead of silently skipping it.
- Crawl4AI: the harvest lane is evaluating it. A Crawl4AI adapter would
  plug in as an alternate fetcher behind the same AcquisitionAdapter
  interface (same typed observations out), gated by a named gap and
  Nolan's go. Not integrated here.

## Rights boundary

Arbitrary third-party media ingestion still needs a rights/policy boundary
(per the product authority decisions). Media acquisition runs ONLY when the fetched page's final host is one of the
two explicitly authorized demo sources (`happy-place-platform.vercel.app`,
`www.coppersmithplumbing.com`, `coppersmithplumbing.com`), and only when the fetched page's host matches that tenant's
allowlisted host. Everything else gets MEDIA_RIGHTS_SCOPE (typed skip), never silent
media, never silent generalization.

## Gaps (documented, not hidden)

- Document upload at intake is recorded only: filenames are listed on the
  job page with DOCUMENT_INTAKE_TODO. Parsing is not wired.
- `ping.social.media@1` is not accepted by the object-builder schema
  catalog, so media objects attach AFTER builder verification (they are
  presentation-side; the planner does not consume them).
- `readPipelineManifest(tenantId)` uses the same key the media pipeline
  was run with, so the intake tenant IDs double as manifest keys.
- The job page renders BuildClient without `siteId`: the owner panel is
  not mounted (ephemeral preview, nothing persisted as a canonical site).

## Proof

- `npx tsx scripts/fyd-live-proof.ts` re-acquires both demo businesses
  live plus hostile URLs (private IP, loopback, metadata endpoint, bad
  scheme, credential URL, 404, non-HTML, 1ms timeout) and writes a JSON
  evidence file to /tmp.
- `npx jest --config src/fyd/acquisition/jest.config.cjs` for the
  hostile-unit suite (no real network; injected dnsLookup/fetchImpl).
