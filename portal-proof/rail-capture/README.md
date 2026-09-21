# rail-capture (Lane E)

Screenshot + geometry matrix for the `/portal-rail` side-rail placement
harness. Visual evidence for the rail default-rule decision.

## Run

On the Pig, inside `/home/nolan/projects/ping`:

```sh
LD_LIBRARY_PATH=~/browser-libs/usr/lib/x86_64-linux-gnu \
  node portal-proof/rail-capture/rail-capture.mjs
```

Env: `RAIL_PORT` (default 3100), `RAIL_SHOTS` (default
`/tmp/rail-proof/shots-rail`).

## What it does

- Spawns `npm run dev -- -p <port>` if nothing answers there (reuses an
  existing server otherwise, and never kills one it did not start).
- Drives headless Chromium through 50 capture rows (48 unique PNGs; the
  two sticky-scroll `s0` rows are byte-identical to the auto-rule `s0`
  captures and share the file, noted in the manifest).
- Per capture reads `window.__railMetrics`, screenshots the viewport,
  and records extras: engaged-panel bbox vs content overlap, sticky
  vertical state, narrow-viewport collapse checks.
- Writes `manifest.json` with per-row metrics, the auto-rule's chosen
  side per business/viewport, and any invariant violations
  (`overlapPx != 0` or `hOverflowPx != 0`).

Lane E does not change harness code: findings are recorded, not fixed.
