#!/bin/bash
# start.sh -- launch the fyd-journal-gateway with its write credential.
# K2 (2026-09-27): Mission K's bearer-token patch requires
# FYD_JOURNAL_WRITE_TOKEN in the gateway process env. This script reads the
# token from the 0600 nolan-only file (never committed to git) and exports
# it for the gateway process. Override the path with
# FYD_JOURNAL_WRITE_TOKEN_FILE.
# No token file -> the gateway still starts, but every write is refused with
# 503 write_auth_not_configured: fail closed, never silently unauthenticated.
set -u
HERE="$(dirname "$(readlink -f "$0")")"
TOKEN_FILE="${FYD_JOURNAL_WRITE_TOKEN_FILE:-$HOME/.config/ping/fyd-journal-write-token}"
if [ -f "$TOKEN_FILE" ]; then
  FYD_JOURNAL_WRITE_TOKEN="$(cat "$TOKEN_FILE")"
  export FYD_JOURNAL_WRITE_TOKEN
else
  echo "start.sh: WARNING: no token file at $TOKEN_FILE; writes will 503 (fail closed)" >&2
fi
cd "$HERE"
exec /home/nolan/.local/node-v22.23.2-linux-x64/bin/node server.mjs >> gateway.log 2>&1
