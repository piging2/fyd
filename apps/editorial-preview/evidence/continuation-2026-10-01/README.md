# PING website continuation — October 1, 2026

## Open the comparison

- [CURRENT PING](http://100.79.154.43:3100/)
- [NEW PING](http://127.0.0.1:3214/)
- [Learn](http://127.0.0.1:3214/docs)
- [Build journal](http://127.0.0.1:3214/blog)

The new site is a private local candidate. The operating workspace is an interface study; it loads no live missions, approvals, or tenant data.

## What changed in this continuation

- Preserved the existing WSL candidate and its uncommitted work. The saved source already contained the restored operating study and graph, while the running process was serving an older public composition. Rebuilt and refreshed only the candidate.
- Retained the giant wordmark, objects at both desktop margins, interactive seal, and purple/gold accents. Brought the primary actions up beside the heading. Moved the mobile object row below the wordmark.
- Corrected inherited grid styles that squeezed the problem section and journal. All four journal articles now have a complete graphic and readable card width.
- Added a clearly illustrative returning-customer example to every step of the architecture walkthrough.
- Finished workspace playback: one cancellable timer, pause on manual choice, leaving the viewport, a hidden page, or changed motion preference; immediate stop at the final step. Reduced motion keeps manual controls and hides playback.
- Made the unknown-outcome branch explanatory: hold and reconcile; no implied automatic retry or real action controls.
- Fixed the FYD action URL and aligned the hero’s “How PING works” destination with the navigation.
- Corrected Learn maturity labels to match their linked public architecture, and removed internal checkout language from public copy.
- Corrected graph inspector, FYD header, and primitive-number contrast. Preserved a keyboard-accessible skip link and prevented it appearing in neutral section captures.
- Regenerated the app lockfile from the pinned package manifest in an isolated temporary directory, removing legacy absolute donor dependency links. Shared dependency files were not changed.

## Verification

| Check | Result |
|---|---|
| Production build | Passed; homepage, Learn, journal, four article routes, public API |
| Editorial projection/binding/URL tests | 36 / 36 passed |
| Responsive matrix | 48 / 48 passed: 12 widths, 2 heights, ordinary/reduced motion |
| Accessibility | 16 axe WCAG A/AA checks; zero reported violations |
| Browser errors | None observed in the tested flows |
| Interactions | Menu/Escape/focus return, skip link, object dialog, both FYD businesses, services, source disclosure, bounded flow tour, primitive selection, unknown search |
| Workspace | All three tabs and steps, arrow/Home/End keys, bounded playback, pause, offscreen pause, unknown branch, reduced motion |
| Content | Four published articles render and their local routes return HTTP 200 |
| Original site | HTTP 200 before and after; no control source or process edits |
| Whitespace | git diff --check passed |

These are targeted checks, not certification of the entire repository. The handoff records four pre-existing failures in the broader dogfood suite; that broader suite was not rerun in this continuation.

## Local performance sample

One fresh Chrome context per site and viewport, no CPU/network throttling, reduced motion, private/local servers. These are lab observations, not field Core Web Vitals or a statistically reliable speed comparison. The two sites use different local server paths.

| Site / width | LCP | CLS | Resource transfer, excluding document |
|---|---:|---:|---:|
| Current / 390 | 256 ms | 0 | 377,114 bytes |
| Candidate / 390 | 208 ms | 0.0443 | 263,019 bytes |
| Current / 1440 | 212 ms | 0 | 379,272 bytes |
| Candidate / 1440 | 240 ms | 0.0133 | 260,622 bytes |

## Remaining limits

- Independent source/content review produced actionable findings which were corrected. A requested independent review of the final screenshots could not finish because the reviewer hit its usage limit. Final visual inspection was performed by the implementing agent; independent visual signoff remains open.
- The normalized lockfile audit reports PostCSS advisories and an affected Next dependency (one high and one moderate package-level finding). See `../continuation-audit.json`. This pass did not upgrade Next across a major version or modify the shared donor installation. Resolve and validate dependencies in an isolated install before public release.
- The current running build still uses the preserved root dependency installation. The new registry-only lockfile was generated and audited; a clean install was not used for this build.
- The homepage remains intentionally extensive. Mobile users can use navigation for direct access to FYD, the workspace, learning, and writing. The business object row can shift as its public records arrive; measured CLS is recorded above.

## Preservation and startup

Candidate: `/home/nolan/2026-09-22/you-re-really-good-at-web/work/ping-parallel`

Branch: `codex/ping-parallel-review`; HEAD remains `76248bda`. Existing and new edits remain uncommitted. No merge, public deployment, migration, runtime authority, Docker, Tailscale, donor repository, or Windows rollback-mirror change was made.

The app is `apps/editorial-preview`. With its candidate server stopped and the preserved dependencies available:

```bash
cd /home/nolan/2026-09-22/you-re-really-good-at-web/work/ping-parallel/apps/editorial-preview
npm run build
npm run start
```

The start script binds `127.0.0.1:3214`. Identify a port owner and verify its `/proc/<pid>/cwd` before restarting any process. Candidate log: `/tmp/ping-preview-continuation.log`.

Browser checks use installed Windows Chrome and the preserved Playwright library. Their scripts and raw JSON are saved beside this report. Screenshots prefixed `comparison-`, `review-`, or `new-` were refreshed in this continuation; earlier files named “final” are not evidence for this version.
