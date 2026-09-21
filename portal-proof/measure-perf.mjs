// Portal Circle proof harness: performance measurements.
// Measures transition durations, scroll/resize release behavior, longtasks,
// and frame timing for the portal Circle at 1440x900.
//
// Usage (on the Pig, inside /home/nolan/projects/ping):
//   LD_LIBRARY_PATH=~/browser-libs/usr/lib/x86_64-linux-gnu \
//     node portal-proof/measure-perf.mjs
//
// Env:
//   PORTAL_BASE  base URL under test (default http://localhost:3100/)
//   PORTAL_PERF  output JSON path (default /tmp/portal-proof/perf-results.json)
//
// Each measurement runs 5x on a fresh page; the report prints medians.

import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.PORTAL_BASE ?? "http://localhost:3100/";
const OUT = process.env.PORTAL_PERF ?? "/tmp/portal-proof/perf-results.json";
const ITERS = 5;

const CIRCLE_BTN = 'button[aria-label$="Activate to expand."]';
const DIALOG = 'div[role="dialog"]';
const HAPPY = "Happy Place";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

async function newReadyPage(browser) {
  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction(
    (sel) => document.querySelectorAll(sel).length >= 2,
    CIRCLE_BTN,
    { timeout: 30000 }
  );
  return page;
}

// rest -> engaged: click to animation settle (diameter stable 6 frames).
async function measureEngage(page) {
  return page.evaluate(
    ({ sel, dlg, name }) =>
      new Promise((resolve) => {
        const btn = [...document.querySelectorAll(sel)].find((b) =>
          (b.getAttribute("aria-label") || "").includes(name)
        );
        if (!btn) { resolve({ ok: false, reason: "button-not-found" }); return; }
        const t0 = performance.now();
        let lastW = -1, stable = 0;
        btn.click();
        function tick() {
          const d = document.querySelector(dlg);
          const inner = d ? d.firstElementChild : null;
          const w = inner ? inner.getBoundingClientRect().width : 0;
          if (Math.abs(w - lastW) < 0.75) stable++; else stable = 0;
          lastW = w;
          if (d && stable >= 6) { resolve({ ok: true, ms: performance.now() - t0 }); return; }
          if (performance.now() - t0 > 10000) { resolve({ ok: false, reason: "timeout" }); return; }
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }),
    { sel: CIRCLE_BTN, dlg: DIALOG, name: HAPPY }
  );
}

// engaged -> rest: Close click to collapsed button restored.
async function measureRelease(page) {
  return page.evaluate(
    ({ sel, dlg, name }) =>
      new Promise((resolve) => {
        const closeBtn = document.querySelector('button[aria-label="Close"]');
        if (!closeBtn) { resolve({ ok: false, reason: "close-not-found" }); return; }
        const t0 = performance.now();
        let stable = 0;
        closeBtn.click();
        function tick() {
          const d = document.querySelector(dlg);
          const btn = [...document.querySelectorAll(sel)].find((b) =>
            (b.getAttribute("aria-label") || "").includes(name)
          );
          const op = btn ? parseFloat(getComputedStyle(btn).opacity) : 0;
          if (!d && Math.abs(op - 1) < 0.03) stable++; else stable = 0;
          if (stable >= 6) { resolve({ ok: true, ms: performance.now() - t0 }); return; }
          if (performance.now() - t0 > 10000) { resolve({ ok: false, reason: "timeout" }); return; }
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }),
    { sel: CIRCLE_BTN, dlg: DIALOG, name: HAPPY }
  );
}

// Scroll while engaged: engage, scroll to bottom, measure release latency.
async function measureScrollRelease(page) {
  await page.evaluate(
    ({ sel, name }) => {
      const btn = [...document.querySelectorAll(sel)].find((b) =>
        (b.getAttribute("aria-label") || "").includes(name)
      );
      btn.click();
    },
    { sel: CIRCLE_BTN, name: HAPPY }
  );
  await page.locator(DIALOG).waitFor({ timeout: 15000 });
  await sleep(800);
  return page.evaluate(
    ({ sel, dlg, name }) =>
      new Promise((resolve) => {
        const t0 = performance.now();
        const y0 = window.scrollY;
        window.scrollTo(0, document.body.scrollHeight);
        let stable = 0;
        function tick() {
          const d = document.querySelector(dlg);
          const btn = [...document.querySelectorAll(sel)].find((b) =>
            (b.getAttribute("aria-label") || "").includes(name)
          );
          const op = btn ? parseFloat(getComputedStyle(btn).opacity) : 0;
          if (!d && Math.abs(op - 1) < 0.03) stable++; else stable = 0;
          if (stable >= 3) {
            resolve({ ok: true, released: true, ms: performance.now() - t0, scrolledBy: window.scrollY - y0 });
            return;
          }
          if (performance.now() - t0 > 6000) {
            resolve({ ok: true, released: false, ms: -1, scrolledBy: window.scrollY - y0 });
            return;
          }
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }),
    { sel: CIRCLE_BTN, dlg: DIALOG, name: HAPPY }
  );
}

// Semantic target leaves viewport: engage, scroll target out, record state.
async function measureTargetOutOfView(page) {
  await page.evaluate(
    ({ sel, name }) => {
      const btn = [...document.querySelectorAll(sel)].find((b) =>
        (b.getAttribute("aria-label") || "").includes(name)
      );
      btn.click();
    },
    { sel: CIRCLE_BTN, name: HAPPY }
  );
  await page.locator(DIALOG).waitFor({ timeout: 15000 });
  await sleep(800);
  return page.evaluate(
    ({ dlg }) =>
      new Promise((resolve) => {
        const target = document.querySelector('[data-ping-object="happy-place"]');
        if (!target) { resolve({ ok: false, reason: "target-not-found" }); return; }
        const r = target.getBoundingClientRect();
        const outBefore = r.bottom < 0 || r.top > window.innerHeight;
        // Scroll the target fully out of view (above the viewport).
        window.scrollTo(0, window.scrollY + r.top - window.innerHeight - 50);
        const samples = [];
        const t0 = performance.now();
        const iv = setInterval(() => {
          const rr = target.getBoundingClientRect();
          samples.push({
            t: Math.round(performance.now() - t0),
            targetOut: rr.bottom < 0 || rr.top > window.innerHeight,
            dialogOpen: !!document.querySelector(dlg),
          });
          if (performance.now() - t0 > 3000) {
            clearInterval(iv);
            const last = samples[samples.length - 1];
            resolve({
              ok: true,
              targetWasOutBefore: outBefore,
              targetOutAfter: last.targetOut,
              dialogOpenAfter3s: last.dialogOpen,
              releasedDuringWindow: samples.some((s) => !s.dialogOpen),
              samples,
            });
          }
        }, 250);
      }),
    { dlg: DIALOG }
  );
}

// Resize while engaged: engage at 1440x900, shrink to 1280x800, observe.
async function measureResizeRelease(page) {
  await page.evaluate(
    ({ sel, name }) => {
      const btn = [...document.querySelectorAll(sel)].find((b) =>
        (b.getAttribute("aria-label") || "").includes(name)
      );
      btn.click();
    },
    { sel: CIRCLE_BTN, name: HAPPY }
  );
  await page.locator(DIALOG).waitFor({ timeout: 15000 });
  await sleep(800);
  const before = await page.evaluate((dlg) => !!document.querySelector(dlg), DIALOG);
  await page.setViewportSize({ width: 1280, height: 800 });
  await sleep(3000);
  const after = await page.evaluate((dlg) => !!document.querySelector(dlg), DIALOG);
  return { ok: true, dialogOpenBefore: before, dialogOpenAfter3s: after, released: before && !after };
}

// Longtasks during engage: install observer, engage, collect for 2.5s.
async function measureLongTasks(page) {
  await page.evaluate(() => {
    window.__lt = [];
    window.__ltObs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__lt.push({ duration: Math.round(e.duration * 10) / 10, startTime: Math.round(e.startTime) });
      }
    });
    window.__ltObs.observe({ entryTypes: ["longtask"] });
  });
  const eng = await measureEngage(page);
  await sleep(2500);
  const entries = await page.evaluate(() => {
    if (window.__ltObs) window.__ltObs.disconnect();
    return window.__lt || [];
  });
  const total = entries.reduce((a, e) => a + e.duration, 0);
  return {
    ok: eng.ok,
    engageMs: eng.ok ? Math.round(eng.ms) : -1,
    longtaskCount: entries.length,
    longtaskTotalMs: Math.round(total * 10) / 10,
    longtaskMaxMs: entries.length ? Math.max(...entries.map((e) => e.duration)) : 0,
  };
}

// Frame timing during engage: rAF deltas from click to settle.
async function measureFrames(page) {
  const deltas = await page.evaluate(
    ({ sel, dlg, name }) =>
      new Promise((resolve) => {
        const btn = [...document.querySelectorAll(sel)].find((b) =>
          (b.getAttribute("aria-label") || "").includes(name)
        );
        if (!btn) { resolve(null); return; }
        const stamps = [];
        let lastW = -1, stable = 0, last = performance.now();
        btn.click();
        function tick(now) {
          stamps.push(now);
          const d = document.querySelector(dlg);
          const inner = d ? d.firstElementChild : null;
          const w = inner ? inner.getBoundingClientRect().width : 0;
          if (Math.abs(w - lastW) < 0.75) stable++; else stable = 0;
          lastW = w; last = now;
          const done = (d && stable >= 6) || stamps.length > 600;
          if (done) {
            const ds = [];
            for (let i = 1; i < stamps.length; i++) ds.push(stamps[i] - stamps[i - 1]);
            resolve(ds);
            return;
          }
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }),
    { sel: CIRCLE_BTN, dlg: DIALOG, name: HAPPY }
  );
  if (!deltas || deltas.length < 2) return { ok: false, reason: "no-frames" };
  const s = [...deltas].sort((a, b) => a - b);
  const med = s[Math.floor(s.length / 2)];
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  return {
    ok: true,
    frames: deltas.length,
    avgFps: Math.round((1000 / mean) * 10) / 10,
    medianFrameMs: Math.round(med * 100) / 100,
    droppedFrames: deltas.filter((d) => d > 2 * med).length, // >2x median
    longFrames: deltas.filter((d) => d > 50).length,          // >50ms
  };
}

async function paintEntries(page) {
  return page.evaluate(() =>
    performance.getEntriesByType("paint").map((e) => ({
      name: e.name,
      startTime: Math.round(e.startTime * 10) / 10,
    }))
  );
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const results = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    viewport: "1440x900",
    browserVersion: browser.version(),
    iterations: ITERS,
    measurements: {},
  };
  console.log(`browser: ${browser.version()}`);

  // Warmup (dev server compile).
  {
    const p = await newReadyPage(browser);
    await p.close();
    console.log("warmup done");
  }

  const run = async (key, fn, summarize) => {
    const vals = [];
    for (let i = 0; i < ITERS; i++) {
      const page = await newReadyPage(browser);
      try {
        vals.push(await fn(page));
      } catch (e) {
        vals.push({ ok: false, reason: `exception: ${e && e.message}` });
      } finally {
        await page.close();
      }
      console.log(`  ${key} iter ${i + 1}/${ITERS} done`);
    }
    results.measurements[key] = summarize(vals);
  };

  const msMedian = (vals) => {
    const ok = vals.filter((v) => v.ok && v.ms >= 0).map((v) => v.ms);
    return {
      runs: vals.length,
      okRuns: ok.length,
      medianMs: ok.length ? Math.round(median(ok) * 10) / 10 : null,
      allMs: vals.map((v) => (v.ok && v.ms >= 0 ? Math.round(v.ms * 10) / 10 : v.reason || v.ms)),
    };
  };

  await run("rest_to_engaged", measureEngage, msMedian);
  await run("engaged_to_rest", async (page) => {
    const e = await measureEngage(page);
    if (!e.ok) return e;
    await sleep(600);
    return measureRelease(page);
  }, msMedian);
  await run("scroll_release_while_engaged", measureScrollRelease, (vals) => {
    const lat = vals.filter((v) => v.ok && v.released).map((v) => v.ms);
    return {
      runs: vals.length,
      releasedCount: vals.filter((v) => v.ok && v.released).length,
      medianReleaseMs: lat.length ? Math.round(median(lat) * 10) / 10 : null,
      all: vals,
    };
  });
  await run("target_out_of_viewport", measureTargetOutOfView, (vals) => ({
    runs: vals.length,
    okRuns: vals.filter((v) => v.ok).length,
    releasedCount: vals.filter((v) => v.ok && v.releasedDuringWindow).length,
    dialogOpenAfter3sCount: vals.filter((v) => v.ok && v.dialogOpenAfter3s).length,
    all: vals,
  }));
  await run("resize_while_engaged", measureResizeRelease, (vals) => ({
    runs: vals.length,
    releasedCount: vals.filter((v) => v.ok && v.released).length,
    all: vals,
  }));
  await run("longtask_during_engage", measureLongTasks, (vals) => {
    const ok = vals.filter((v) => v.ok);
    return {
      runs: vals.length,
      okRuns: ok.length,
      medianLongtaskCount: ok.length ? median(ok.map((v) => v.longtaskCount)) : null,
      medianLongtaskTotalMs: ok.length ? Math.round(median(ok.map((v) => v.longtaskTotalMs)) * 10) / 10 : null,
      medianLongtaskMaxMs: ok.length ? Math.round(median(ok.map((v) => v.longtaskMaxMs)) * 10) / 10 : null,
      medianEngageMs: ok.length ? Math.round(median(ok.map((v) => v.engageMs)) * 10) / 10 : null,
      all: vals,
    };
  });
  await run("frame_timing_during_engage", measureFrames, (vals) => {
    const ok = vals.filter((v) => v.ok);
    return {
      runs: vals.length,
      okRuns: ok.length,
      medianAvgFps: ok.length ? median(ok.map((v) => v.avgFps)) : null,
      medianMedianFrameMs: ok.length ? Math.round(median(ok.map((v) => v.medianFrameMs)) * 100) / 100 : null,
      medianDroppedFrames: ok.length ? median(ok.map((v) => v.droppedFrames)) : null,
      medianLongFrames: ok.length ? median(ok.map((v) => v.longFrames)) : null,
      all: vals,
    };
  });

  // Paint entries are page-load paints; collect once on a fresh load.
  {
    const page = await newReadyPage(browser);
    results.measurements.paint_entries_on_load = await paintEntries(page);
    await page.close();
  }

  await browser.close();
  fs.mkdirSync(OUT.replace(/\/[^/]+$/, ""), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
  console.log(`results: ${OUT}`);
  console.log(JSON.stringify(results.measurements, (k, v) => (k === "all" || k === "samples" ? `[${v.length} items]` : v), 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
