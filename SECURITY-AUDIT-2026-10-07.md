# Security Audit: PING FYD Converged
Date: 2026-10-07
Branch: fyd/builder-composition
Auditor: Pigi (automated sweep)

## VERIFIED Findings

### V-001: Unauthenticated Tenant Graph Exposure (P2) - CRITICAL
**Status:** VERIFIED (proven exploitable via curl)

**Affected routes (no authentication):**
- `GET /api/mc/search?q=...` — Returns full tenant overview (object counts, services, people, owner corrections) for any tenant mentioned in query.
- `GET /api/mc/object?siteId=...&id=...` — Returns full object details (fields, visibility, provenance, evidence).
- `GET /api/mc/graph?siteId=...` — Returns tenant graph summary.

**Proof:**
```bash
curl "http://localhost:3100/api/mc/search?q=everything%20about%20coppersmith"
# Returns: {"ok":true,"siteId":"coppersmith-plumbing","answer":{"objectCount":8,...}}

curl "http://localhost:3100/api/mc/object?siteId=coppersmith-plumbing&id=..."
# Returns: {"ok":true,"trace":{"object":{"id":"...","fields":{...}}}}
```

**Impact:** Any network-reachable client can enumerate all tenants and extract their full object graphs, including business services, people, and owner corrections. This violates the FYD-010 privacy gate (Ask FYD leaking private owner fields was the concrete PII concern).

**Note:** Only 5 of 14 mc routes use the `mc-tenant-gate.ts` (lineage, missions, marketingos). The gate itself is explicitly "NOT authorization against a deliberate loopback caller" — it's a soft header-based scope, not real auth.

**Proposed fix (requires owner decision on auth model):**
Option A: Apply `callerScope()` to search/object/graph/crm. Operator (no header) gets dashboard view; tenant header scopes to that tenant; mismatched siteId → 403.
Option B: Require `x-mc-caller-key` (like approvals/dispatch routes) for all mc routes serving tenant data.
Option C: Move these routes behind the existing FYD visibility model (public vs private objects).

Do NOT implement without Nolan's approval on which option.

## CANDIDATE Findings

### C-001: Dependency Vulnerabilities - HIGH
**Status:** CANDIDATE (real CVEs, exploitability unproven)

From `npm audit`:
- `brace-expansion` (high): GHSA-q2hr-2g5m-vwhr (quadratic-time DoS), GHSA-qhr7-859c-m2p7 (stack exhaustion), GHSA-6j4f-fj2g-mc7p (recursion DoS). Fix via `npm audit fix`.
- `braces` (high): GHSA-vfj7-8cjw-p6xm (stack exhaustion DoS). Fix requires `--force` (breaking).
- `@opentelemetry/core` <2.8.0 (moderate): GHSA-8988-4f7v-96qf (unbounded memory in W3C Baggage). Via @fedify/fedify; fix is breaking.

**Note:** These are transitive dependencies. Exploitability requires the vulnerable code paths to be reachable from user input. `brace-expansion` is typically used in glob patterns (build-time, not runtime user input).

## Checked and CLEAR

- **Secrets:** No hardcoded API keys, private keys, or passwords in src/. Only `.env.example` exists; `.gitignore` properly excludes `.env`.
- **SQL Injection:** `mc-ping-journal.ts` uses parameterized queries (`p.query(text, params)`) with a read-only gate (rejects non-SELECT/WITH).
- **Command Injection:** No `exec()`, `execSync()`, or `spawn()` in API routes.
- **Path Traversal:** `fyd/build/[jobId]/rendered` validates jobId with `/^live-[0-9a-f]{12}$/` before file path construction.
- **XSS:** All `dangerouslySetInnerHTML` uses are safe:
  - `layout.tsx`: JSON-LD via `JSON.stringify` (safe).
  - `site-editor-client.tsx`: `edgeClientScript(siteId)` uses `JSON.stringify(siteSlug)` (safe).
  - `blog/[slug]/page.tsx`: `renderMarkdown()` uses `escapeHtml()` on all user content (safe).
- **Ask FYD Visibility:** Pipeline passes `fieldVisibilityDecisions` to answer engine; route docs specify "PUBLIC objects only" for visitor mode.

## Recommendations

1. **Immediate:** Decide auth model for mc routes (V-001). This is the P2.
2. **Soon:** Run `npm audit fix` for brace-expansion (non-breaking). Evaluate braces/@opentelemetry upgrades.
3. **Ongoing:** The mc-tenant-gate's "not real auth" disclaimer means the MC surface should not be exposed beyond loopback without stronger auth.
