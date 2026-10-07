#!/bin/bash
# Item 11 (fyd-execution): run the lab measurement leg.
#
# Two legs:
#   1. transport leg (always runnable): curl-measured transfer bytes per
#      site through the egress proxy; regenerates pinned.ts + BASELINE.md.
#   2. browser leg (needs a live browser): Playwright/CDP driver, both
#      sites x both viewports, N=5, JSON reports under var/perf/lab/.
#
# The browser leg runs on the Pig via the house browser (:9223) under the
# portable Windows node (see ~/workspace/AGENTS.md). It is SKIPPED
# automatically when no browser is reachable; the transport leg always runs.
#
# Usage: run-lab.sh [--transport-only] [--base http://100.79.154.43:3100]
set -u
HARNESS_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$HARNESS_DIR/../../../.." && pwd)"
BASE="${2:-http://100.79.154.43:3100}"
PROXY="http://hatch-egress-proxy:3130"
SITES="coppersmith-plumbing happy-place"
VAR_DIR="$REPO_DIR/var/perf/lab"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

transport_bytes() {
  local site="$1" kind="$2" # kind: js | css
  local html attr total
  html="$(curl -s --proxy "$PROXY" "$BASE/sites/$site")"
  if [ "$kind" = "js" ]; then
    attr='src="'
    urls="$(echo "$html" | grep -o '<script[^>]*src="[^"]*"' | sed 's/.*src="//;s/"//' | sort -u)"
  else
    urls="$(echo "$html" | grep -o '<link[^>]*rel="stylesheet"[^>]*>' | grep -o 'href="[^"]*"' | sed 's/href="//;s/"//' | sort -u)"
  fi
  total=0
  for u in $urls; do
    case "$u" in /*) url="$BASE$u";; *) url="$u";; esac
    s="$(curl -s --proxy "$PROXY" -o /dev/null -w "%{size_download}" "$url")"
    total=$((total + s))
  done
  echo "$total"
}

echo "== transport leg =="
JS_COPPER="$(transport_bytes coppersmith-plumbing js)"
JS_HAPPY="$(transport_bytes happy-place js)"
CSS_COPPER="$(transport_bytes coppersmith-plumbing css)"
CSS_HAPPY="$(transport_bytes happy-place css)"
echo "js: copper=$JS_COPPER happy=$JS_HAPPY"
echo "css: copper=$CSS_COPPER happy=$JS_HAPPY"

BROWSER_OK=0
if [ "${1:-}" != "--transport-only" ]; then
  WIN_NODE="/mnt/c/Users/nolan/.local/share/pigi/node-v22.23.2-win-x64/node.exe"
  if [ -x "$WIN_NODE" ]; then
    # Probe the house browser CDP before committing to the full run.
    if "$WIN_NODE" -e "fetch('http://127.0.0.1:9223/json/version').then(r=>{if(!r.ok)throw 0}).then(()=>console.log('cdp-ok')).catch(()=>console.log('cdp-down'))" 2>/dev/null | grep -q cdp-ok; then
      BROWSER_OK=1
    else
      echo "house browser CDP not reachable; browser leg skipped"
    fi
  else
    echo "portable Windows node not found; browser leg skipped"
  fi
fi

if [ "$BROWSER_OK" = "1" ]; then
  echo "== browser leg =="
  DRIVER_WIN="$(wslpath -w "$HARNESS_DIR/driver.cjs")"
  # playwright-core lives with the engagement tooling; probe common homes.
  if [ -z "${NODE_PATH:-}" ]; then
    for cand in \
      "/mnt/c/Users/nolan/workspace/fb-engage/node_modules" \
      "/mnt/c/Users/nolan/.local/share/pigi/node-v22.23.2-win-x64/node_modules"; do
      if [ -d "$cand/playwright-core" ]; then
        export NODE_PATH="$cand"
        echo "NODE_PATH=$cand"
        break
      fi
    done
  fi
  for site in $SITES; do
    for viewport in desktop mobile; do
      out="$VAR_DIR/$site/$viewport/$STAMP.json"
      mkdir -p "$(dirname "$out")"
      out_win="$(wslpath -w "$out")"
      /mnt/c/Users/nolan/.local/share/pigi/node-v22.23.2-win-x64/node.exe "$DRIVER_WIN" \
        --url "$BASE/sites/$site" --site "$site" --viewport "$viewport" \
        --runs 5 --out "$out_win" --cdp "http://127.0.0.1:9223" \
        || echo "WARN: browser leg failed for $site/$viewport"
    done
  done
else
  echo "browser leg skipped (no live browser in this environment)"
fi

echo "== pin + baseline =="
node "$HARNESS_DIR/pin.cjs" \
  --js-copper "$JS_COPPER" --js-happy "$JS_HAPPY" \
  --css-copper "$CSS_COPPER" --css-happy "$CSS_HAPPY" \
  --browser-ok "$BROWSER_OK" --stamp "$STAMP"
echo "done."
