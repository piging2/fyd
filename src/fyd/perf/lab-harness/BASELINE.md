# FYD lab performance baseline

Label: **LAB-transport** (curl-measured transfer bytes through the egress
proxy). NOT field performance; never p75, never CrUX, never real-user.

Measured: 2026-10-07T22:17:05.874Z (run 2026-10-07-prefixed-baseline). Browser leg: NOT RUN — no live browser in this environment.

Method: fetch page HTML, extract every `<script src>` / stylesheet link,
sum `%{size_download}` (identity encoding, raw bytes, no compression).

| Metric (LAB-transport) | coppersmith-plumbing | happy-place |
|---|---|---|
| JS transferred | 852139 B | 852139 B |
| CSS transferred | 161122 B | 161122 B |

## Not measured here

LCP element, LCP, CLS, FCP, long tasks require the browser leg
(driver.cjs via the Pig house browser). Transport timings (TTFB) through
the proxy are single-sample context, not lab vitals.

## Reading this file

- `jsBudgetBytes` in pinned.ts is the machine-readable record the
  js-budget regression test pins against.
- `heroLcp` gates hero fetchpriority (null = unmeasured = no priority).
- A future measurement that moves these numbers must re-run the harness
  and re-pin with evidence (INV-PM-1: no performance-motivated change
  ships without a before/after lab report on both sites).
