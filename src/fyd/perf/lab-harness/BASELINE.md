# FYD lab performance baseline

Label: **LAB-transport** (curl-measured transfer bytes through the egress
proxy). NOT field performance; never p75, never CrUX, never real-user.

Measured: 2026-10-07T22:52:00Z (post-item-8/9/10/11 deploy, build
gD5ahRaVZTp5yxVrtW6XX, commit dc601412). Browser leg: NOT RUN — no live
browser in this environment.

Method: fetch page HTML (N=5, median), extract every `<script src>` /
stylesheet link, sum `%{size_download}` (identity encoding, raw bytes,
no compression).

| Metric (LAB-transport) | coppersmith-plumbing | happy-place |
|---|---|---|
| HTML transferred | 66190 B | 63838 B |
| JS transferred | 854316 B | 854316 B |
| CSS transferred | 161122 B | 161122 B |

Pre-fix reference (2026-10-07T22:17:05Z, pre-item-8/9/10/11 deploy):
HTML 63618 / 61179 B, JS 852139 B, CSS 161122 B. Delta: JS +2177 B
(+0.25%), HTML +2572 / +2659 B (srcset/sizes/provenance attributes),
CSS unchanged. Honest attribution: the item-8 server/island split moved
JS ~0 as predicted (sibling-owned site-client.tsx still imports the whole
tree); the +2.2K is worker C's item 6/7 client code plus the new
visitor-islands module in the shared bundle.

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
