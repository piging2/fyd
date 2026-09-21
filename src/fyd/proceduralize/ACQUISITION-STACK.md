# FYD Acquisition Stack: Evaluation and Design

Status: evaluation complete. No crawler platform built. This doc records what was
investigated (exact versions), the L0-L4 escalation design, the thin
AcquisitionAdapter interface, the egress/privacy policy, and ADOPT/HARVEST/REJECT
decisions per component.

FYD's compiler path is sources -> evidence -> object graph -> SiteSpec. This doc
owns the leftmost arrow only: getting raw URL content in as typed observations.
Converting observations into evidence-backed objects belongs to the
deterministic extraction pipeline (sibling lane). AI interpretation is the last
resort, not a layer of the fetch stack.

## 1. Version investigation (verified 2026-09-21)

### Crawl4AI 0.9.3 (PyPI, latest; `pip index versions crawl4ai`)

Released August 2026. A security release: closed five coordinated-disclosure
advisories and carried 33 bug fixes from develop. The five advisories were all in
the PDF path and share one root cause: `PDFContentScrapingStrategy` could be
selected from an untrusted Docker API request body and downloaded with
`requests` rather than through the browser, so none of the Chromium-side
controls reached it:

- Arbitrary file write: untrusted request body chose where extracted PDF images
  were written.
- SSRF: the PDF download followed redirects into internal addresses.
- DoS: remote PDFs downloaded and parsed with no size or page cap. New defaults:
  100 MiB and 2000 pages.
- XSS: PDF text written into `cleaned_html` without escaping.
- DOM XSS: the Playground result viewer re-parsed crawled content as live HTML,
  risking the operator's API token.

This continues the secure-by-default hardening the task brief noted: 0.8.7 began
it, 0.9.0 moved the worst issues from mitigation to architecture. Per the
0.9.0 changelog: the Docker API server now enables authentication by default and
binds loopback (no unauthenticated API on 0.0.0.0); a crawl request body carries
declarative scalar options only, so request-supplied code/config is rejected at
the network boundary; arbitrary Python hook strings were replaced by a fixed set
of declarative actions, removing request-supplied code from the server entirely;
SSRF destination validation now covers the streaming crawl path (`/crawl` with
`stream=true` returns HTTP 400 for disallowed targets); download sinks confine
writes with basename plus realpath plus `O_NOFOLLOW`; deny-by-default CORS,
strict security headers, TLS verification, password-protected loopback-only
Redis, bounded job queue.

Features relevant to FYD acquisition (present across 0.8.x-0.9.3, read from the
official release docs, not executed):

- DomainMapper (0.8.7+): comprehensive domain URL discovery with subdomain and
  per-source timeout controls.
- AsyncUrlSeeder (bulk discovery): sitemap/Common Crawl/search sources,
  thousands of URLs in seconds.
- 3-tier anti-bot detection with proxy escalation and a fallback fetch function
  (0.8.5). The detection tiers (known vendors, generic block indicators,
  structural integrity checks) are interesting; the automatic proxy escalation
  is not.
- Shadow DOM flattening via `flatten_shadow_dom` (0.8.5).
- Consent popup auto-dismissal across 40+ CMP platforms (0.8.5).
- Prefetch mode: 5-10x faster URL discovery (0.8.0).
- Deep crawl crash recovery (`resume_state`, `on_state_change`) and deep crawl
  cancellation (0.8.0, 0.8.5).
- Config defaults API: `set_defaults()` / `get_defaults()` / `reset_defaults()`.

Important defaults and risks found during investigation:

- `check_robots_txt` defaults to **false**. Our wrapper must force it true.
- Python with a heavy dependency tree, including a browser toolchain. In the FYD
  TypeScript runtime this cannot be a direct dependency; any use would be as an
  isolated engine behind our adapter boundary, not as an import.
- The documented Docker server config historically showed JWT disabled and
  trusted hosts `*` (0.9.x tightened this, but never deploy without verifying
  the pinned version's actual defaults).
- The v0.9 hook API removed inline Python in favor of declarative hooks. Docs
  still carry mixed-version examples, so pin and verify the actual release.
- License: Apache 2.0.

### Playwright 1.63.0 (npm, latest; `npm view playwright version`)

Released early September 2026. This is a **test-focused** release. Official
release notes (microsoft/playwright, js/python/java/csharp docs) list:

- Named test locks: tests sharing a lock name never run concurrently.
- `page.frameLocator()` called without a selector now searches any frame of the
  subtree; the rest of the locator resolves inside a single frame.
- `Locator.visible`: matches only visible elements, the recommended replacement
  for the `:visible` CSS pseudo-class.
- Tracing: `ariaSnapshots` and `screenSnapshots` options capture an aria
  snapshot plus screenshot on every action; the trace viewer shows them side by
  side with hover highlighting.
- Improvements to reporter data, HTTP authentication, storage state,
  accessibility snapshots, CLI tooling, and browser coverage.

Scraping relevance: nothing in 1.63 changes the acquisition story. The useful
pieces for the deterministic L2 fallback are the visible-only locator (cleaner
visible-text extraction) and aria snapshots (structured, stable DOM views for
extraction). One caution from the ecosystem: 1.63 renamed the tracing capture
parameters on the wire, which silently broke third-party drivers
(playwright-rust) until pinned. Lesson: pin playwright and its browser build
together; never float either.

### What was proven vs read

Proven locally: exact latest versions (PyPI `crawl4ai` 0.9.3; npm
`playwright` 1.63.0). Everything else in this section was read from the
official GitHub release docs and changelogs. Nothing was executed: no live
crawl was run, no anti-bot tier was tested against a real target, no Playwright
browser was launched. The gaps section below lists what only a live run can
verify.

## 2. Escalation pipeline: L0 to L4

Deterministic escalation, not always-render. Each level has a typed sufficiency
gate; a level runs only when the previous level's evidence is insufficient for
the site-object questions at hand. The policy intent: never spend browser
automation (latency, cost, detection surface) when static HTTP already yielded
sufficient evidence.

### LEVEL 0: policy gate (no network fetch of content)

- URL canonicalization: parse, lowercase host, strip fragment, drop default
  ports, reject malformed URLs.
- Scheme allowlist: `https` and `http` only. Reject `javascript:`, `data:`,
  `file:`, `ftp:`, and any URL carrying userinfo (credentials in the URL are
  never accepted).
- SSRF defense: resolve the hostname, reject loopback (127.0.0.0/8, ::1),
  private (RFC 1918), link-local (169.254.0.0/16, fe80::/10), multicast,
  and the cloud metadata address (169.254.169.254). Re-resolve after each
  redirect and re-validate, since redirects are the classic DNS-rebinding path.
- Domain policy: the registrable domain of the acquisition target is allowed by
  default; any other domain must appear in the request's explicit allowlist.
- robots.txt: fetch, parse, honor disallows and crawl-delay. (Upstream
  crawl4ai defaults `check_robots_txt=false`; our adapter defaults it true and
  offers no off switch in the public API.)
- Per-domain rate limiting and a descriptive user agent identifying FYD.
- Output: a `PolicyDecision` (allowed, blocked with reason, or redirect that
  must re-enter L0).

### LEVEL 1: HTTP fast path (static fetch)

- Single GET with the egress policy from section 4. Follow redirects only
  within the domain policy and the redirect cap; every hop re-runs L0 checks.
- Accept HTML only (plus explicit feed/sitemap content types when that is the
  requested resource). Reject binaries and oversized bodies at the size cap.
- Deterministic parse, no browser, no JavaScript:
  - JSON-LD blocks (parsed, schema-typed if known).
  - OpenGraph and meta tags.
  - Canonical URL, title, headings, visible text, image alt text.
  - All links with href, rel, and anchor text, classified internal/external.
- Sitemap and RSS/Atom discovery from robots.txt and well-known paths
  (`/sitemap.xml`, `/feed`); parse them as URL inventories, not content.
- Sufficiency gate: if the observations answer the needed site-object fields
  (identity, offerings, contact points, hours, service area, social links),
  stop here. L1 is the expected terminal level for most small-business sites.

### LEVEL 2: browser-rendered fallback (bounded, only on L1 insufficiency)

- Trigger: L1 returned insufficient evidence, typed as an evidence gap (e.g.
  `EMPTY_BODY_AFTER_JS`, `CONTENT_BEHIND_CLIENT_RENDER`, `SHADOW_DOM_CONTENT`).
  L2 is never triggered by "might be nicer with JS".
- Playwright (pinned, see section 5) with a wall-clock budget per page and a
  hard per-acquisition timeout. No login, no form submission, no interaction
  beyond deterministic consent dismissal.
- Consent handling: deterministic auto-dismissal from a pinned CMP list
  (crawl4ai's 40+ CMP coverage in 0.8.5 is the reference to harvest), never a
  human-posed consent click.
- Extraction uses visible-only locators and aria snapshots so the output is the
  same class of deterministic observations L1 produces, plus a flag that L2 was
  used.
- Anti-bot behavior: detect and report blocks honestly; never escalate with
  proxies or stealth profiles. A blocked page is evidence of a block, not a
  problem to route around.

### LEVEL 3: bounded discovery (sitemap/RSS/internal links, page budget)

- Trigger: the target needs multi-page objects (menu, services list, staff,
  locations) and L1/L2 of the seed page did not cover them.
- Discovery order: sitemap/RSS inventory first, then internal links from
  already-acquired pages. Never crawl the open web; stay inside the domain
  policy.
- Hard page budget per acquisition (seed plus N pages), byte budget, and
  duration budget. Skip media and binaries by content type and size.
- Each discovered page goes through L0, then L1, then L2 only on the same
  insufficiency rule. Depth is capped and recorded on every observation.

### LEVEL 4: AI interpretation (only after deterministic extraction is exhausted)

- Trigger: deterministic extraction (sibling lane) has run on all acquired
  observations and still cannot fill a required field; the gap is typed and
  recorded.
- AI operates on the acquired observations only, never on live fetch. It does
  not get a browser, a network, or new URLs.
- All AI-produced claims carry the lowest confidence tier, keep the source
  observation's provenance, and are marked as AI-interpreted so downstream
  evidence grading can distinguish them from deterministic observations.
- Extracted text is untrusted input at every level. Prompt-injection surface:
  no acquired text ever enters an instruction channel unquoted.

## 3. AcquisitionAdapter interface (TypeScript types)

FYD code concentrates on converting observations into evidence-backed objects,
not on fetching. The adapter is the only thing that touches the network, and
it is types-only here: no implementation in this commit.

```typescript
/**
 * AcquisitionAdapter: raw URL in, typed observations out.
 * The implementation is replaceable (static fetcher, Playwright L2,
 * a crawl4ai-derived engine). Callers never see which engine ran.
 */

export type AcquisitionLevel = 0 | 1 | 2 | 3;

export interface AcquisitionRequest {
  /** Seed URL. Must pass L0 policy checks. */
  url: string;
  /** Extra registrable domains allowed beyond the seed's own domain. */
  allowedDomains: string[];
  /** Why we are acquiring; recorded on every observation for audit. */
  purpose: string;
  /** Allow multi-page discovery (L3). Default false: seed page only. */
  allowDiscovery: boolean;
  /** Max pages including the seed, when allowDiscovery is true. */
  pageBudget: number;
  /** Max link-follow depth from the seed. */
  maxDepth: number;
}

export interface AcquisitionPolicy {
  maxBodyBytes: number;          // per response body, e.g. 2 MiB for HTML
  timeoutMs: number;             // per request
  acquisitionTimeoutMs: number;  // whole acquisition, all levels
  maxRedirects: number;
  blockPrivateNetworks: boolean; // always true in production
  requireRobotsTxt: boolean;      // always true in production
  userAgent: string;              // identifies FYD, e.g. "FYD-SocialBot/1.0 (+https://...)"
  rateLimitPerDomainMs: number;
  allowedContentTypes: string[]; // e.g. text/html, application/rss+xml, ...
  browserWallClockMs: number;     // L2 per-page budget
}

export interface AcquiredLink {
  href: string;
  absoluteUrl: string;
  rel: string | null;
  anchorText: string;
  internal: boolean;
}

export interface AcquiredObservation {
  url: string;
  finalUrl: string;              // after redirects
  fetchedAt: string;             // ISO 8601
  statusCode: number;
  contentType: string;
  bytes: number;
  truncated: boolean;
  levelUsed: AcquisitionLevel;
  depth: number;                 // 0 for the seed
  title: string | null;
  meta: Record<string, string>;
  openGraph: Record<string, string>;
  jsonLd: unknown[];
  canonicalUrl: string | null;
  links: AcquiredLink[];
  /** Notes the adapter must surface: robots directives seen, blocks detected,
      consent dismissed, truncation, policy downgrades. */
  policyNotes: string[];
  /** Hash of the raw bytes, so downstream evidence can prove what was seen. */
  evidenceHash: string;
  /** Typed reason L2/L3/L4 escalation was (or was not) triggered. */
  escalation: { from: AcquisitionLevel; to: AcquisitionLevel; reason: string }[];
}

export interface PolicyDecision {
  allowed: boolean;
  reason: string;                // always set when blocked
  normalizedUrl: string | null;
}

export interface AcquisitionAdapter {
  /** L0 gate, also usable standalone by the scheduler. */
  checkPolicy(url: string, allowedDomains: string[]): Promise<PolicyDecision>;
  /** Run the escalation pipeline; resolves with one observation per page. */
  acquire(request: AcquisitionRequest, policy: AcquisitionPolicy): Promise<AcquiredObservation[]>;
}
```

The thin module `src/fyd/acquisition/acquisition-adapter.ts` carries these
types and nothing else. An implementation must be a separate, reviewable
commit, and must prove the egress policy in section 4 with tests before it
fetches anything real.

## 4. Egress and privacy policy (enforced at the adapter boundary)

1. **Allowed domains, explicit.** The seed URL's registrable domain is allowed;
   every other domain must be listed in `AcquisitionRequest.allowedDomains`.
   Nothing else leaves the machine.
2. **No credentialed URLs.** Any URL with userinfo is rejected at L0. No auth
   headers, cookies, or tokens are attached to acquisition requests. No
   authenticated sources in the initial implementation, full stop.
3. **No internal network, ever.** Loopback, RFC 1918, link-local, multicast,
   and 169.254.169.254 are blocked. DNS is resolved before connect and
   re-resolved after every redirect; a redirect to a blocked address aborts
   the acquisition and is recorded as a policy note, not retried.
4. **Content-size caps.** `maxBodyBytes` per response; bodies stream with an
   early abort. Binaries and media are rejected by content type before the
   body is read.
5. **Timeout budget.** Per-request `timeoutMs`, per-page L2 wall clock, and a
   whole-acquisition `acquisitionTimeoutMs`. No unbounded waits.
6. **No cross-acquisition state.** No cookie jar shared between acquisitions;
   no browser profile reuse; each acquisition starts clean so one target's
   state can never leak into another's.
7. **Identification.** A descriptive user agent names FYD and gives a contact
   path. robots.txt is honored including crawl-delay, and politeness rate
   limits apply per domain.
8. **Provenance.** Every observation records the URL, final URL, fetch time,
   level used, purpose, and `evidenceHash`. Extracted web text is labeled
   untrusted evidence and never enters an instruction channel unquoted.
9. **Retention.** Raw bytes are kept only long enough to hash and extract;
   the observation (structured, capped) is what persists. No PII is sought;
   any PII encountered incidentally is not stored beyond the observation.

## 5. Decision table

| Component | Version investigated | Decision | Reason |
|---|---|---|---|
| Crawl4AI library (pip) | 0.9.3 (PyPI, verified) | HARVEST | Harvest the hardened engine's design, not the dependency: SSRF destination validation, declarative request trust boundary, DomainMapper and AsyncUrlSeeder discovery patterns, prefetch fast-discovery, Shadow DOM flattening, the 40+ CMP consent-dismissal list, and the 3-tier anti-bot *detection* tiers (detection is honest telemetry; the proxy escalation is not adopted). Do not import the Python package into the TypeScript runtime, do not enable its LLM extraction, do not deploy its Docker server. The adapter's L0-L4 semantics above are the harvested shape, re-implemented in our own bounded adapter. |
| Playwright (npm) | 1.63.0 (npm, verified) | HARVEST as L2 engine | The L2 fallback needs a real renderer, and Playwright is the standard one. Pin playwright and its browser build together (1.63's tracing wire changes broke unpinned third-party drivers; we do not repeat that). Use visible-only locators and aria snapshots for deterministic extraction output. Scope is strictly L2: a bounded render fallback, never an always-on rendering farm. |
| Crawl4AI Docker API server | 0.9.3 | REJECT | A new authenticated network surface with a history of RCE, SSRF, auth-bypass, and file-write advisories. L0-L4 needs no server; the adapter runs in-process. Revisit only if acquisition must leave the FYD process, and then only pinned, token-authed, loopback-bound. |
| Crawl4AI LLM extraction | 0.9.3 | REJECT | Nondeterministic, needs API keys and a second provider-policy path, and turns untrusted page text into prompt-injection surface at scale. L4 already covers AI interpretation, after deterministic extraction is exhausted, on observations only. |
| Anti-bot proxy escalation / stealth profiles | 0.8.5+ | REJECT | Automatic circumvention is not an ordinary FYD capability. Detect blocks and record them as evidence; respect platform constraints and fail closed. |
| check_robots_txt=false (upstream default) | 0.9.x | REJECT the default | Our adapter requires robots.txt and offers no public off switch. Politeness is a feature of the product, not a config option. |
| Building our own crawling platform | n/a | REJECT | Explicit non-goal of this lane. The deliverable is the adapter interface and policy; the only implementation allowed is the bounded L0-L2 fetcher the interface describes, reviewed and tested before it touches the network. |

## 6. Honest gaps

- No live crawl was run. Anti-bot detection tiers, consent-dismissal coverage,
  Shadow DOM flattening, and the DomainMapper/seeder discovery patterns were
  read from release docs, not exercised. Their real-world effectiveness against
  FYD's actual target sites (small home-service business sites, mostly simple
  static or template-built pages) is unverified.
- The DNS-rebinding defense (re-resolve after redirect) and the robots.txt
  parsing edge cases need tests against fixtures before any implementation is
  trusted.
- Playwright 1.63's scraping-relevant surface is thin; if the L2 renderer
  needs more than visible-only locators and aria snapshots, that will surface
  during implementation and should be recorded here.
- Boundary with the sibling deterministic extraction lane: this doc emits
  `AcquiredObservation`; the proceduralizer consumes it. The handoff contract
  (confidence tiers, evidence grading) lives on their side.

## Sources

- Crawl4AI v0.9.3 release notes (August 2026): github.com/unclecode/crawl4ai
  `docs/blog/release-v0.9.3.md`.
- Crawl4AI CHANGELOG: secure-by-default hardening across 0.8.7-0.9.0.
- Crawl4AI v0.8.5 release notes (March 2026): anti-bot, Shadow DOM, consent
  popups; v0.8.0 (prefetch mode, crash recovery); v0.8.7 (DomainMapper).
- Playwright 1.63 official release notes (September 2026):
  microsoft/playwright `docs/src/release-notes-js.md` (and python/java/csharp).
- Third-party integration assessment of crawl4ai security posture (read as a
  secondary source; its control list informed section 4).
