# Portal Circle proof harness

Two Playwright harnesses used to produce the FYD portal Circle proof matrix
(screenshots) and performance measurements. They run against a local Next.js
dev server serving the homepage with `<PortalHost>`.

## Files

- `capture-matrix.mjs` - drives both business circles through their states at
  each viewport and writes PNGs plus `manifest.json`.
- `measure-perf.mjs` - transition durations, scroll/resize release behavior,
  longtask counts, and rAF frame timing at 1440x900 (5 iterations each,
  medians reported). Writes `perf-results.json`.

## Requirements

- Node 22, on the Pig in `/home/nolan/projects/ping`
- `npm i -D @playwright/test` (harness imports `playwright`; the `playwright`
  package's bundled Chromium build must be installed via
  `npx playwright install chromium`)
- Pig WSL lacks browser system libs; launch with
  `LD_LIBRARY_PATH=~/browser-libs/usr/lib/x86_64-linux-gnu`
  (see FAILURE_LEDGER FL-20260921-215)

## Run

```bash
cd /home/nolan/projects/ping
export LD_LIBRARY_PATH=~/browser-libs/usr/lib/x86_64-linux-gnu

# screenshots -> /tmp/portal-proof/shots/<business>/<viewport>/<state>.png
PORTAL_BASE=http://localhost:3100/ node portal-proof/capture-matrix.mjs

# perf -> /tmp/portal-proof/perf-results.json
PORTAL_BASE=http://localhost:3100/ node portal-proof/measure-perf.mjs
```

## Screenshot matrix

- Businesses: `happy-place`, `coppersmith-plumbing` (matched at runtime by
  circle button aria-label substring; the harness aborts loudly if the
  labels do not contain the expected business names).
- Viewports: 1920x1080, 1440x900, 1280x800, 834x1112, 390x844,
  1440x900-zoom150 (960x600 CSS px at deviceScaleFactor 1.5, which is what
  150% browser zoom renders at 1440x900 device px),
  1440x900-reduced-motion (`reducedMotion: "reduce"`).
- States: full set (collapsed, aware, engaged, ask, following, liked) at
  1440x900 for both businesses; collapsed + engaged elsewhere;
  narrow-fallback (dock-mode engagement under scroll) at 390x844.

`manifest.json` records per shot: dock active or not, engaged diameter in px,
and notes (ask outcome, follow/like already persisted, errors).

## Perf measurements (1440x900, median of 5)

- `rest_to_engaged`: click to animation settle, measured with rAF
  timestamps; settle = engaged diameter stable (<0.75px change) for
  6 consecutive frames.
- `engaged_to_rest`: Close click to collapsed button restored
  (dialog gone, opacity back to 1, stable 6 frames).
- `scroll_release_while_engaged`: scroll to page bottom while engaged;
  latency to release (or `released: false` after 6s).
- `target_out_of_viewport`: scroll the `[data-ping-object]` semantic target
  out of view while engaged; records attention/state changes over 3s.
- `resize_while_engaged`: 1440x900 -> 1280x800 while engaged; records
  whether the circle releases.
- `longtask_during_engage`: PerformanceObserver longtask entries during
  engage plus a 2.5s window (count, total ms, max ms).
- `frame_timing_during_engage`: rAF deltas during engage; avg fps,
  dropped frames (>2x median frame time), long frames (>50ms).
- `paint_entries_on_load`: `performance.getEntriesByType('paint')` on a
  fresh load (first-paint / first-contentful-paint; these are load-time
  paints, not transition paints).

Known limits: forced-reflow counts are not observable through standard web
APIs, so longtask entries are reported as the proxy. Headless Chromium
drives rAF from its own compositor clock, not the Pig display, so fps
numbers describe the headless pipeline, not a physical display.
