// Engagement/placement lifecycle regression (portal placement lane).
//
// Defect: Circle engaged (open/expanded) -> viewport resizes -> derived
// placement mode changes (RAIL -> COLLAPSED) -> engagement did NOT
// release/reconcile. The host kept a stale engaged id; when geometry
// returned, the Circle remounted engaged with no engaged geometry: an
// invisible (opacity-0) launcher with aria-expanded=true and no dialog.
//
// Coverage: viewport transitions 1920->1280, 1440->1280, and
// 1440->1280->1440 (the honest 1280->1440 leg: at 1280/auto no circle
// renders, so engagement cannot start there; the return leg is where
// stale engagement becomes observable). Each transition engages the
// Circle BEFORE the resize and asserts afterwards:
//   1. no stale/invisible interactive surface remains (engagement
//      released or correctly reconciled to the new mode), and
//   2. the frozen placement rule still holds (greatest safe whitespace /
//      collapsed launcher; overlapPx == 0 and hOverflowPx == 0).
//
// Usage (on the Pig, inside /home/nolan/projects/ping):
//   LD_LIBRARY_PATH=~/browser-libs/usr/lib/x86_64-linux-gnu \
//     node portal-proof/rail-resize-regression/resize-regression.mjs
//
// Env: RAIL_PORT (default 3100). Spawns `npm run dev` when nothing
// answers on the port; reuses (and leaves running) an existing server.
// Exit 0 = REGRESSION PASS, 1 = failures (details on stdout, failure
// screenshots in /tmp/rail-resize-regression/).

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const PORT = parseInt(process.env.RAIL_PORT ?? "3100", 10);
const REPO = "/home/nolan/projects/ping";
const BASE = `http://localhost:${PORT}/portal-rail`;
const SHOT_DIR = "/tmp/rail-resize-regression";

const CIRCLE_BTN = 'button[aria-label$="Activate to expand."]';
const DIALOG = 'div[role="dialog"]';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function probe() {
  try {
    const res = await fetch(`${BASE}?business=happy-place&side=auto&mode=static`);
    return res.status;
  } catch {
    return 0;
  }
}

async function ensureServer() {
  if ((await probe()) === 200) {
    console.log("dev server already up on :" + PORT + "; reusing");
    return null;
  }
  console.log("spawning dev server on :" + PORT);
  const dev = spawn("npm", ["run", "dev", "--", "-p", String(PORT)], {
    cwd: REPO,
    stdio: ["ignore", "pipe", "pipe"],
  });
  dev.stdout.on("data", (d) => process.stdout.write("[dev] " + d));
  dev.stderr.on("data", (d) => process.stderr.write("[dev:err] " + d));
  const deadline = Date.now() + 180000;
  for (;;) {
    if ((await probe()) === 200) {
      console.log("dev server ready");
      return dev;
    }
    if (Date.now() > deadline) {
      dev.kill("SIGTERM");
      throw new Error("dev server did not become ready in 180s");
    }
    await sleep(2000);
  }
}

const TRANSITIONS = [
  {
    id: "T1-1920-1280", business: "happy-place", mode: "sticky",
    from: "1920x1080", to: "1280x800",
    start: { width: 1920, height: 1080 }, target: { width: 1280, height: 800 },
  },
  {
    id: "T2-1440-1280", business: "coppersmith-plumbing", mode: "static",
    from: "1440x900", to: "1280x800",
    start: { width: 1440, height: 900 }, target: { width: 1280, height: 800 },
  },
  {
    // Honest 1280->1440 leg: at 1280/auto no circle renders, so engagement
    // cannot start there. This round trip engages at 1440, collapses at
    // 1280, and returns to 1440, where stale engagement would resurface.
    id: "T3-1280-1440-roundtrip", business: "happy-place", mode: "sticky",
    from: "1440x900", to: "1280x800",
    start: { width: 1440, height: 900 }, target: { width: 1280, height: 800 },
  },
];

const checks = [];
function check(tid, name, pass, detail) {
  checks.push({ tid, name, pass, detail: detail ?? "" });
  console.log(`${pass ? "PASS" : "FAIL"} [${tid}] ${name}${detail ? " -- " + detail : ""}`);
}

async function readState(page) {
  return page.evaluate(
    ({ btnSel, dlgSel }) => {
      const m = window.__railMetrics ?? null;
      const btn = document.querySelector(btnSel);
      const dialogs = document.querySelectorAll(dlgSel).length;
      let opacity = null;
      let expanded = null;
      let visible = false;
      if (btn) {
        opacity = getComputedStyle(btn).opacity;
        expanded = btn.getAttribute("aria-expanded");
        const b = btn.getBoundingClientRect();
        visible = b.width > 0 && b.height > 0;
      }
      return {
        side: m?.side ?? null,
        portalBoxNull: m ? m.portalBox === null : null,
        overlapPx: m?.overlapPx ?? null,
        hOverflowPx: m?.hOverflowPx ?? null,
        btnPresent: !!btn,
        btnVisible: visible,
        btnOpacity: opacity,
        btnExpanded: expanded,
        dialogCount: dialogs,
      };
    },
    { btnSel: CIRCLE_BTN, dlgSel: DIALOG },
  );
}

async function waitForSide(page, side, timeout = 10000) {
  await page.waitForFunction(
    (s) => window.__railMetrics && window.__railMetrics.side === s,
    side,
    { timeout },
  );
}

async function runTransition(browser, t) {
  const page = await browser.newPage({ viewport: t.start });
  const url = `${BASE}?business=${t.business}&side=auto&mode=${t.mode}`;
  try {
    await page.goto(url, { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(() => window.__railMetrics != null, null, {
      timeout: 30000,
    });

    // Engage BEFORE the resize.
    const btn = page.locator(CIRCLE_BTN);
    await btn.waitFor({ state: "visible", timeout: 15000 });
    const m0 = await readState(page);
    check(t.id, "start: frozen rule picks right rail", m0.side === "right", `side=${m0.side}`);
    await btn.click();
    await page.locator(DIALOG).waitFor({ state: "visible", timeout: 15000 });
    await sleep(900);

    // Resize into the target (collapsed) geometry.
    await page.setViewportSize(t.target);
    await waitForSide(page, "none").catch(() => {});
    await sleep(900);
    const a = await readState(page);
    check(t.id, `${t.from}->${t.to}: no stale engaged surface`, a.dialogCount === 0, `dialogs=${a.dialogCount}`);
    check(
      t.id,
      `${t.from}->${t.to}: placement collapsed per rule`,
      a.side === "none" && a.portalBoxNull === true,
      `side=${a.side} portalBoxNull=${a.portalBoxNull}`,
    );
    check(
      t.id,
      `${t.from}->${t.to}: launcher not rendered when collapsed`,
      a.btnPresent === false,
      `btnPresent=${a.btnPresent}`,
    );
    check(
      t.id,
      `${t.from}->${t.to}: invariants hold`,
      a.overlapPx === 0 && a.hOverflowPx === 0,
      `overlap=${a.overlapPx} hoverflow=${a.hOverflowPx}`,
    );

    // Return leg: stale engagement (if any) becomes observable here.
    await page.setViewportSize(t.start);
    await waitForSide(page, "right").catch(() => {});
    await sleep(900);
    const b = await readState(page);
    check(t.id, `return ${t.to}->${t.from}: no stale engaged surface`, b.dialogCount === 0, `dialogs=${b.dialogCount}`);
    check(
      t.id,
      `return ${t.to}->${t.from}: launcher visible and not engaged`,
      b.btnPresent && b.btnVisible && b.btnExpanded === "false" && b.btnOpacity !== "0",
      `present=${b.btnPresent} visible=${b.btnVisible} expanded=${b.btnExpanded} opacity=${b.btnOpacity}`,
    );
    check(
      t.id,
      `return ${t.to}->${t.from}: rule picks right rail again`,
      b.side === "right" && b.portalBoxNull === false,
      `side=${b.side} portalBoxNull=${b.portalBoxNull}`,
    );
    check(
      t.id,
      `return ${t.to}->${t.from}: invariants hold`,
      b.overlapPx === 0 && b.hOverflowPx === 0,
      `overlap=${b.overlapPx} hoverflow=${b.hOverflowPx}`,
    );
  } catch (err) {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const shot = path.join(SHOT_DIR, `${t.id}-failure.png`);
    await page.screenshot({ path: shot }).catch(() => {});
    check(t.id, "transition completed without error", false, `${err.message} (shot: ${shot})`);
  } finally {
    await page.close();
  }
}

async function main() {
  const dev = await ensureServer();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    console.log("chromium launched:", browser.version());
    for (const t of TRANSITIONS) await runTransition(browser, t);
  } finally {
    await browser?.close();
    if (dev) {
      dev.kill("SIGTERM");
      console.log("stopped spawned dev server");
    }
  }
  const failed = checks.filter((c) => !c.pass);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length) {
    console.log("FAILURES:");
    for (const f of failed) console.log(`  [${f.tid}] ${f.name} -- ${f.detail}`);
    process.exit(1);
  }
  console.log("REGRESSION PASS");
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
