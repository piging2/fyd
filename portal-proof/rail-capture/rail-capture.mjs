// Portal rail placement proof: screenshot + geometry matrix (Lane E).
//
// Drives the /portal-rail harness (src/app/portal-rail) through the full
// placement matrix and records window.__railMetrics per capture. Visual
// evidence for the side-rail default-rule decision.
//
// Self-contained: if nothing answers on RAIL_PORT it spawns
// `npm run dev -- -p <port>` as a child, waits for readiness, runs the
// matrix, then stops the server it started. If a server is already up it
// reuses it and leaves it running.
//
// Usage (on the Pig, inside /home/nolan/projects/ping):
//   LD_LIBRARY_PATH=~/browser-libs/usr/lib/x86_64-linux-gnu \
//     node portal-proof/rail-capture/rail-capture.mjs
//
// Env:
//   RAIL_PORT   dev server port (default 3100)
//   RAIL_SHOTS  output dir (default /tmp/rail-proof/shots-rail)
//
// Writes PNGs to <RAIL_SHOTS>/<business>/<viewport>/<side>-<mode>-<scroll>.png
// and manifest.json alongside.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const PORT = parseInt(process.env.RAIL_PORT ?? "3100", 10);
const OUT = process.env.RAIL_SHOTS ?? "/tmp/rail-proof/shots-rail";
const REPO = "/home/nolan/projects/ping";
const BASE = `http://localhost:${PORT}/portal-rail`;

const BUSINESSES = ["happy-place", "coppersmith-plumbing"];
const CORE_VPS = [
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
];
const VP_1440 = { name: "1440x900", width: 1440, height: 900 };
const VP_NARROW = { name: "390x844", width: 390, height: 844 };

const CIRCLE_BTN = 'button[aria-label$="Activate to expand."]';
const DIALOG = 'div[role="dialog"]';
const CONTENT_SEL = "#rail-content";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function shotPath(biz, vpName, file) {
  const dir = path.join(OUT, biz, vpName);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, file);
}

// ---------------------------------------------------------------- matrix
// Each spec: {id, group, business, vp, side, mode, scrollLabel, scroll,
//             actions, file, extra}
const SPECS = [];
function addSpec(s) {
  SPECS.push(s);
}

// 1. Core geometry: 2 biz x 3 vp x 2 forced sides x 2 modes, scroll 0 (24).
let n = 0;
for (const biz of BUSINESSES)
  for (const vp of CORE_VPS)
    for (const side of ["left", "right"])
      for (const mode of ["static", "sticky"])
        addSpec({
          id: `core-${String(++n).padStart(2, "0")}`,
          group: "core",
          business: biz,
          vp,
          side,
          mode,
          scrollLabel: "s0",
          scroll: 0,
          actions: ["settle"],
          file: `${side}-${mode}-s0.png`,
        });

// 2. Auto rule: 2 biz x 3 vp x auto x 2 modes, scroll 0 (12).
for (const biz of BUSINESSES)
  for (const vp of CORE_VPS)
    for (const mode of ["static", "sticky"])
      addSpec({
        id: `auto-${biz === "happy-place" ? "hp" : "cs"}-${vp.name}-${mode}`,
        group: "auto",
        business: biz,
        vp,
        side: "auto",
        mode,
        scrollLabel: "s0",
        scroll: 0,
        actions: ["settle"],
        file: `auto-${mode}-s0.png`,
      });

// 3. Engaged in rail: 1440x900, both biz, auto, both modes (4).
for (const biz of BUSINESSES)
  for (const mode of ["static", "sticky"])
    addSpec({
      id: `engaged-${biz === "happy-place" ? "hp" : "cs"}-${mode}`,
      group: "engaged",
      business: biz,
      vp: VP_1440,
      side: "auto",
      mode,
      scrollLabel: "engaged",
      scroll: 0,
      actions: ["engage", "settle"],
      file: `auto-${mode}-engaged.png`,
      extra: "engaged-panel",
    });

// 4. Sticky scroll: 1440x900, both biz, auto, sticky, s0/smid/sbottom (6).
//    s0 is the identical capture to the auto-rule s0: deduped below.
for (const biz of BUSINESSES)
  for (const [scrollLabel, scroll] of [
    ["s0", 0],
    ["smid", "mid"],
    ["sbottom", "bottom"],
  ])
    addSpec({
      id: `sticky-scroll-${biz === "happy-place" ? "hp" : "cs"}-${scrollLabel}`,
      group: "sticky-scroll",
      business: biz,
      vp: VP_1440,
      side: "auto",
      mode: "sticky",
      scrollLabel,
      scroll,
      actions: scroll === 0 ? ["settle"] : ["scroll", "settle"],
      file: `auto-sticky-${scrollLabel}.png`,
      extra: "vertical-state",
    });

// 5. Static scroll: 1440x900, both biz, auto, static, smid (2).
for (const biz of BUSINESSES)
  addSpec({
    id: `static-scroll-${biz === "happy-place" ? "hp" : "cs"}-smid`,
    group: "static-scroll",
    business: biz,
    vp: VP_1440,
    side: "auto",
    mode: "static",
    scrollLabel: "smid",
    scroll: "mid",
    actions: ["scroll", "settle"],
    file: `auto-static-smid.png`,
    extra: "vertical-state",
  });

// 6. Narrow collapse: 390x844, both biz, auto, sticky (2).
for (const biz of BUSINESSES)
  addSpec({
    id: `narrow-${biz === "happy-place" ? "hp" : "cs"}`,
    group: "narrow",
    business: biz,
    vp: VP_NARROW,
    side: "auto",
    mode: "sticky",
    scrollLabel: "s0",
    scroll: 0,
    actions: ["settle"],
    file: `auto-sticky-s0.png`,
    extra: "narrow-checks",
  });

// Dedupe identical (url, viewport, actions) captures: two spec rows may
// share one PNG; the manifest records the sharing honestly.
const seen = new Map();
for (const s of SPECS) {
  const url = `${BASE}?business=${s.business}&side=${s.side}&mode=${s.mode}`;
  const key = JSON.stringify([url, s.vp.name, s.actions, s.scroll]);
  if (seen.has(key)) {
    s.sharedFile = seen.get(key).file;
    s.sharedWith = seen.get(key).id;
  } else {
    seen.set(key, s);
  }
}
const UNIQUE = SPECS.filter((s) => !s.sharedFile);
console.log(
  `matrix: ${SPECS.length} rows, ${UNIQUE.length} unique captures (${SPECS.length - UNIQUE.length} deduped)`
);

// ---------------------------------------------------------------- server
async function probe() {
  try {
    const res = await fetch(`${BASE}?business=happy-place&side=auto&mode=static`);
    return res.status;
  } catch {
    return 0;
  }
}

async function ensureServer() {
  const first = await probe();
  if (first === 200) {
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
    const code = await probe();
    if (code === 200) {
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

// ---------------------------------------------------------------- capture
async function readMetrics(page) {
  let m = await page.evaluate(() => window.__railMetrics ?? null);
  if (!m) {
    await sleep(1000);
    m = await page.evaluate(() => window.__railMetrics ?? null);
  }
  return { metrics: m, metricsMissing: !m };
}

async function resolveScroll(page, scroll) {
  if (scroll === 0) return 0;
  if (scroll === "mid")
    return page.evaluate(
      () => Math.floor((document.documentElement.scrollHeight - window.innerHeight) / 2)
    );
  if (scroll === "bottom")
    return page.evaluate(
      () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
    );
  throw new Error("unknown scroll: " + scroll);
}

function verticalState(box, vh) {
  if (!box) return "no-portal";
  if (box.y + box.height <= 0) return "scrolled-away-above";
  if (box.y >= vh) return "below-viewport";
  if (box.y >= 0 && box.y + box.height <= vh) return "fully-visible";
  return "partially-visible";
}

async function extraMeasurements(page, spec, metrics) {
  if (spec.extra === "engaged-panel") {
    return page.evaluate(
      ({ contentSel, dialogSel }) => {
        const dlg = document.querySelector(dialogSel);
        const content = document.querySelector(contentSel);
        const r = (el) => {
          const b = el.getBoundingClientRect();
          return { x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) };
        };
        const panelBox = dlg ? r(dlg) : null;
        let panelContentOverlapPx = 0;
        if (dlg && content) {
          const a = dlg.getBoundingClientRect();
          const b = content.getBoundingClientRect();
          const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
          const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
          panelContentOverlapPx = Math.round(x * y);
        }
        const railWidth = content
          ? Math.round((window.innerWidth - content.getBoundingClientRect().width) / 2)
          : null;
        return {
          panelBox,
          panelContentOverlapPx,
          railWidth,
          panelWiderThanRail: panelBox && railWidth != null ? panelBox.width > railWidth : null,
          panelClippedByViewport:
            panelBox != null
              ? panelBox.x < 0 || panelBox.y < 0 || panelBox.x + panelBox.width > window.innerWidth
              : null,
        };
      },
      { contentSel: CONTENT_SEL, dialogSel: DIALOG }
    );
  }
  if (spec.extra === "vertical-state") {
    const vh = spec.vp.height;
    const box = metrics?.portalBox ?? null;
    return { verticalState: verticalState(box, vh), viewportHeight: vh };
  }
  if (spec.extra === "narrow-checks") {
    return page.evaluate(() => {
      const fixedBottom = [...document.querySelectorAll("*")].filter((el) => {
        if (el.id === "rail-readout") return false;
        const s = getComputedStyle(el);
        if (s.position !== "fixed") return false;
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.height > 0 && b.bottom >= window.innerHeight - 160;
      }).length;
      return {
        portalBoxNull: (window.__railMetrics?.portalBox ?? null) === null,
        railSide: window.__railMetrics?.side ?? null,
        pingHostPresent: !!document.querySelector("[data-ping-host]"),
        dialogCount: document.querySelectorAll('div[role="dialog"]').length,
        fixedBottomCount: fixedBottom,
      };
    });
  }
  return null;
}

async function runCapture(browser, spec) {
  const url = `${BASE}?business=${spec.business}&side=${spec.side}&mode=${spec.mode}`;
  const page = await browser.newPage({
    viewport: { width: spec.vp.width, height: spec.vp.height },
  });
  try {
    await page.goto(url, { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(() => window.__railMetrics != null, null, {
      timeout: 30000,
    }).catch(() => {});
    for (const action of spec.actions) {
      if (action === "scroll") {
        const y = await resolveScroll(page, spec.scroll);
        await page.evaluate((yy) => window.scrollTo(0, yy), y);
        await sleep(700); // rAF-throttled metrics refresh on scroll
      } else if (action === "engage") {
        const btn = page.locator(CIRCLE_BTN);
        await btn.waitFor({ state: "visible", timeout: 15000 });
        await btn.click();
        await page.locator(DIALOG).waitFor({ state: "visible", timeout: 15000 });
        await sleep(1100); // expand animation + image settle
      } else if (action === "settle") {
        await sleep(800);
      }
    }
    const { metrics, metricsMissing } = await readMetrics(page);
    const extra = await extraMeasurements(page, spec, metrics);
    const outFile = shotPath(spec.business, spec.vp.name, spec.file);
    await page.screenshot({ path: outFile });
    const m = metrics ?? {};
    return {
      id: spec.id,
      group: spec.group,
      business: spec.business,
      viewport: spec.vp.name,
      sideParam: spec.side,
      mode: spec.mode,
      scrollLabel: spec.scrollLabel,
      file: path.relative(OUT, outFile),
      sharedWith: spec.sharedWith ?? null,
      metrics: metrics ?? null,
      metricsMissing,
      invariants: {
        overlapPx: m.overlapPx ?? null,
        hOverflowPx: m.hOverflowPx ?? null,
        overlapOk: m.overlapPx === 0,
        hOverflowOk: m.hOverflowPx === 0,
      },
      resolvedSide: m.side ?? null,
      extra,
      notes: [],
    };
  } finally {
    await page.close();
  }
}

// ---------------------------------------------------------------- main
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const dev = await ensureServer();
  const rows = [];
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    console.log("chromium launched:", browser.version());
    let i = 0;
    for (const spec of UNIQUE) {
      i++;
      const t0 = Date.now();
      try {
        const row = await runCapture(browser, spec);
        rows.push(row);
        console.log(
          `ok ${i}/${UNIQUE.length} ${row.id} side=${row.resolvedSide} overlap=${row.invariants.overlapPx} hoverflow=${row.invariants.hOverflowPx} ${Date.now() - t0}ms`
        );
      } catch (err) {
        console.log(`FAIL ${i}/${UNIQUE.length} ${spec.id}: ${err.message}`);
        rows.push({
          id: spec.id,
          group: spec.group,
          business: spec.business,
          viewport: spec.vp.name,
          sideParam: spec.side,
          mode: spec.mode,
          scrollLabel: spec.scrollLabel,
          file: null,
          sharedWith: spec.sharedWith ?? null,
          metrics: null,
          metricsMissing: true,
          invariants: { overlapPx: null, hOverflowPx: null, overlapOk: false, hOverflowOk: false },
          resolvedSide: null,
          extra: null,
          notes: [`capture failed: ${err.message}`],
        });
      }
    }
    // Expand deduped rows so the manifest has one row per spec.
    const byId = new Map(rows.map((r) => [r.id, r]));
    const fullRows = SPECS.map((s) => {
      if (!s.sharedWith) return byId.get(s.id);
      const src = byId.get(s.sharedWith);
      return {
        ...src,
        id: s.id,
        group: s.group,
        scrollLabel: s.scrollLabel,
        notes: [...src.notes, `deduped: identical capture to ${s.sharedWith}; shared file`],
      };
    });
    // Summary: auto-rule chosen side per business per viewport.
    const autoChoices = {};
    for (const r of fullRows) {
      if (r.group !== "auto" || r.scrollLabel !== "s0") continue;
      const key = `${r.business}@${r.viewport}`;
      autoChoices[key] = autoChoices[key] ?? {};
      autoChoices[key][r.mode] = {
        side: r.resolvedSide,
        leftFree: r.metrics?.leftFree ?? null,
        rightFree: r.metrics?.rightFree ?? null,
      };
    }
    const violations = fullRows.filter(
      (r) => r.metrics && (!r.invariants.overlapOk || !r.invariants.hOverflowOk)
    );
    const manifest = {
      generatedAt: new Date().toISOString(),
      base: BASE,
      outDir: OUT,
      specCount: SPECS.length,
      uniqueCaptures: UNIQUE.length,
      autoChoices,
      invariantViolations: violations.map((r) => ({
        id: r.id,
        file: r.file,
        overlapPx: r.invariants.overlapPx,
        hOverflowPx: r.invariants.hOverflowPx,
      })),
      rows: fullRows,
    };
    fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
    console.log(`manifest written: ${OUT}/manifest.json`);
    console.log(`auto choices: ${JSON.stringify(autoChoices)}`);
    console.log(`invariant violations: ${violations.length}`);
  } finally {
    if (browser) await browser.close();
    if (dev) {
      dev.kill("SIGTERM");
      console.log("dev server stopped");
    }
  }
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
