/**
 * Item 11 (fyd-execution): lab performance driver.
 *
 * Headless Chromium via Playwright + CDP. Runs where a real browser can
 * reach the preview: the Pig house browser over CDP (:9223, Windows
 * portable node per ~/workspace/AGENTS.md), or a local Chromium via
 * --executablePath.
 *
 * Conditions are PINNED and recorded in every report: CPU throttling 4x,
 * Fast 3G for the mobile run / unthrottled for desktop, cache disabled,
 * N runs per URL, median reported with min/max.
 *
 * Metrics per run: LCP element (selector + tag), LCP ms, CLS, FCP ms,
 * TTFB ms, long tasks (count + total blocking ms), transferred bytes by
 * type from the CDP Network domain (encodedDataLength: real wire bytes).
 *
 * LAB ONLY. This driver never measures field performance and never
 * claims to: every report carries label "lab". See lab-vocabulary.test.ts.
 *
 * Usage:
 *   node driver.cjs --url <url> --site <id> --viewport desktop|mobile
 *     --runs 5 --out <report.json> [--cdp http://127.0.0.1:9223]
 *     [--executablePath /path/to/chrome]
 */

const fs = require("fs");
const { chromium } = require("playwright-core");

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, network: "unthrottled" },
  mobile: { width: 390, height: 844, network: "fast-3g" },
};

// Lighthouse "Fast 3G" preset, recorded verbatim in every report.
const FAST_3G = {
  offline: false,
  latency: 150,
  downloadThroughput: Math.round((1638.4 * 1024) / 8),
  uploadThroughput: Math.round((750 * 1024) / 8),
};

function arg(name, def) {
  const i = process.argv.indexOf("--" + name);
  return i === -1 ? def : process.argv[i + 1];
}

const URL = arg("url");
const SITE = arg("site", "unknown");
const VIEWPORT_NAME = arg("viewport", "desktop");
const RUNS = parseInt(arg("runs", "5"), 10);
const OUT = arg("out");
const CDP = arg("cdp", null);
const EXEC_PATH = arg("executablePath", null);

if (!URL || !OUT || !VIEWPORTS[VIEWPORT_NAME]) {
  console.error(
    "usage: node driver.cjs --url <url> --site <id> --viewport desktop|mobile --runs 5 --out <report.json> [--cdp <url>] [--executablePath <p>]",
  );
  process.exit(2);
}

const vp = VIEWPORTS[VIEWPORT_NAME];

async function collectOne(page, cdp) {
  const bytes = { script: 0, stylesheet: 0, image: 0, font: 0, document: 0, other: 0 };
  const onFinished = (e) => {
    const t = (e.type || "Other").toLowerCase();
    const key =
      t === "script" ? "script"
      : t === "stylesheet" ? "stylesheet"
      : t === "image" ? "image"
      : t === "font" ? "font"
      : t === "document" ? "document"
      : "other";
    bytes[key] += e.encodedDataLength || 0;
  };
  cdp.on("Network.loadingFinished", onFinished);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  if (vp.network === "fast-3g") {
    await cdp.send("Network.emulateNetworkConditions", FAST_3G);
  } else {
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
    });
  }

  await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  // Let LCP settle: poll until no new LCP for 2s, cap 20s.
  await page.waitForTimeout(3000);

  const perf = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] || {};
    const paints = performance.getEntriesByType("paint");
    const fcp = (paints.find((p) => p.name === "first-contentful-paint") || {}).startTime ?? null;
    const lcps = performance.getEntriesByType("largest-contentful-paint");
    const last = lcps[lcps.length - 1];
    let lcpElement = null;
    if (last && last.element) {
      const el = last.element;
      lcpElement = {
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        className: typeof el.className === "string" ? el.className.split(" ").slice(0, 3).join(" ") : null,
      };
    }
    const shifts = performance.getEntriesByType("layout-shift").filter((s) => !s.hadRecentInput);
    const cls = shifts.reduce((a, s) => a + (s.value || 0), 0);
    const longs = performance.getEntriesByType("longtask");
    return {
      ttfbMs: nav.responseStart != null ? Math.round(nav.responseStart) : null,
      fcpMs: fcp != null ? Math.round(fcp) : null,
      lcpMs: last ? Math.round(last.startTime) : null,
      lcpElement,
      cls: Math.round(cls * 10000) / 10000,
      longTasks: {
        count: longs.length,
        totalBlockingMs: Math.round(longs.reduce((a, t) => a + Math.max(0, t.duration - 50), 0)),
      },
    };
  });

  cdp.removeListener("Network.loadingFinished", onFinished);
  const total = Object.values(bytes).reduce((a, b) => a + b, 0);
  return { ...perf, bytes: { ...bytes, total } };
}

async function main() {
  let browser;
  if (CDP) {
    browser = await chromium.connectOverCDP(CDP);
  } else {
    browser = await chromium.launch({
      headless: false,
      args: ["--headless=new", `--window-size=${vp.width},${vp.height}`, "--no-sandbox"],
      executablePath: EXEC_PATH || undefined,
    });
  }
  const context = browser.contexts()[0] || (await browser.newContext());
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const page = await context.newPage();
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const cdp = await context.newCDPSession(page);
    try {
      runs.push(await collectOne(page, cdp));
      console.log(`run ${i + 1}/${RUNS} ok`);
    } catch (e) {
      console.log(`run ${i + 1}/${RUNS} failed: ${e.message}`);
      runs.push({ error: String(e.message || e) });
    } finally {
      await page.close().catch(() => {});
    }
  }

  const good = runs.filter((r) => !r.error);
  const medianOf = (pick) => {
    const vals = good.map(pick).filter((v) => typeof v === "number").sort((a, b) => a - b);
    if (!vals.length) return null;
    const mid = Math.floor(vals.length / 2);
    return vals.length % 2 ? vals[mid] : Math.round((vals[mid - 1] + vals[mid]) / 2);
  };
  const median = {
    ttfbMs: medianOf((r) => r.ttfbMs),
    fcpMs: medianOf((r) => r.fcpMs),
    lcpMs: medianOf((r) => r.lcpMs),
    lcpElement: (() => {
      const els = good.map((r) => JSON.stringify(r.lcpElement)).filter(Boolean);
      if (!els.length) return null;
      els.sort();
      return JSON.parse(els[Math.floor(els.length / 2)]);
    })(),
    cls: medianOf((r) => r.cls),
    longTasks: {
      count: medianOf((r) => r.longTasks.count),
      totalBlockingMs: medianOf((r) => r.longTasks.totalBlockingMs),
    },
    bytes: {
      script: medianOf((r) => r.bytes.script),
      stylesheet: medianOf((r) => r.bytes.stylesheet),
      image: medianOf((r) => r.bytes.image),
      font: medianOf((r) => r.bytes.font),
      document: medianOf((r) => r.bytes.document),
      other: medianOf((r) => r.bytes.other),
      total: medianOf((r) => r.bytes.total),
    },
  };

  const report = {
    schema: "fyd-lab-report@1",
    label: "lab",
    site: SITE,
    viewport: VIEWPORT_NAME,
    url: URL,
    measuredAt: new Date().toISOString(),
    conditions: {
      cpuThrottling: 4,
      network: vp.network,
      networkParams: vp.network === "fast-3g" ? FAST_3G : "unthrottled",
      cache: "disabled",
      runs: RUNS,
      successfulRuns: good.length,
      viewport: { width: vp.width, height: vp.height },
      driver: CDP ? `playwright-core + CDP ${CDP}` : "playwright-core chromium",
    },
    runs,
    median,
  };
  fs.mkdirSync(require("path").dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log("wrote " + OUT);
  await browser.close().catch(() => {});
}

main().catch((e) => {
  console.error("driver failed: " + (e.stack || e.message));
  process.exit(1);
});
