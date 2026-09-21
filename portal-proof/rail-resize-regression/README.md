# Rail resize regression

Playwright regression for the Circle/portal placement lifecycle defect:
engagement must reconcile with derived placement on viewport transitions.

Run (on the Pig, inside /home/nolan/projects/ping):

  LD_LIBRARY_PATH=~/browser-libs/usr/lib/x86_64-linux-gnu \
    node portal-proof/rail-resize-regression/resize-regression.mjs

Env: RAIL_PORT (default 3100). Spawns `npm run dev` when nothing answers
on the port; reuses a running server otherwise.

Transitions: 1920->1280, 1440->1280, and 1440->1280->1440 (the honest
1280->1440 leg: at 1280/auto no circle renders, so engagement cannot
start there; the return leg is where stale engagement becomes
observable). Each transition engages the Circle BEFORE the resize.

Exit 0 prints REGRESSION PASS. Exit 1 lists failures; failure
screenshots land in /tmp/rail-resize-regression/.
