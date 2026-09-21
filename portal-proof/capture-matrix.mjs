// Portal Circle proof harness: screenshot matrix.
// Drives the FYD portal Circle on the homepage through its states and
// captures viewport screenshots for the proof matrix.
//
// Usage (on the Pig, inside /home/nolan/projects/ping):
//   LD_LIBRARY_PATH=~/browser-libs/usr/lib/x86_64-linux-gnu \
//     node portal-proof/capture-matrix.mjs
//
// Env:
//   PORTAL_BASE   base URL under test (default http://localhost:3100/)
//   PORTAL_SHOTS  output dir (default /tmp/portal-proof/shots)
//
// Writes PNGs to <PORTAL_SHOTS>/<business>/<viewport>/<state>.png and a
// manifest.json alongside with per-shot notes (ask outcome, follow/like
// pre-existing state, engaged diameter, dock active).

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.PORTAL_BASE ?? "http://localhost:3100/";
const OUT = process.env.PORTAL_SHOTS ?? "/tmp/portal-proof/shots";

const BUSINESSES = [
  { id: "happy-place", match: "Happy Place" },
  { id: "coppersmith-plumbing", match: "Coppersmith" },
];

const VIEWPORTS = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "834x1112", width: 834, height: 1112 },
  { name: "390x844", width: 390, height: 844 },
  // 150% browser zoom at 1440x900 device px == 960x600 CSS px at dsf 1.5.
  { name: "1440x900-zoom150", width: 960, height: 600, deviceScaleFactor: 1.5 },
  { name: "1440x900-reduced-motion", width: 1440, height: 900, reducedMotion: "reduce" },
];

function statesFor(vpName) {
  if (vpName === "1440x900") return ["collapsed", "aware", "engaged", "ask", "following", "liked"];
  if (vpName === "390x844") return ["collapsed", "engaged", "narrow-fallback"];
  return ["collapsed", "engaged"];
}

const CIRCLE_BTN = 'button[aria-label$="Activate to expand."]';
const DIALOG = 'div[role="dialog"]';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function shotPath(bizId, vpName, state) {
  const dir = path.join(OUT, bizId, vpName);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${state}.png`);
}

async function waitCircles(page) {
  await page.waitForFunction(
    (sel) => document.querySelectorAll(sel).length >= 2,
    CIRCLE_BTN,
    { timeout: 30000 }
  );
}

// Returns the 0-based index of the circle button whose aria-label matches.
async function buttonIndexFor(page, biz) {
  const labels = await page.locator(CIRCLE_BTN).evaluateAll((els) =>
    els.map((e) => e.getAttribute("aria-label") ?? "")
  );
  const idx = labels.findIndex((l) => l.includes(biz.match));
  if (idx < 0) {
    throw new Error(
      `no circle button matched "${biz.match}"; labels were: ${JSON.stringify(labels)}`
    );
  }
  return idx;
}

async function engagedDiameter(page) {
  return page.evaluate((sel) => {
    const dlg = document.querySelector(sel);
    const inner = dlg ? dlg.firstElementChild : null;
    return inner ? Math.round(inner.getBoundingClientRect().width) : null;
  }, DIALOG);
}

async function dockActive(page) {
  return page.evaluate(() => !!document.querySelector("[data-ping-host]"));
}

async function closeEngaged(page) {
  const closeBtn = page.locator('button[aria-label="Close"]');
  if ((await closeBtn.count()) > 0) {
    await closeBtn.first().click();
    await page.waitForFunction(
      (sel) => !document.querySelector(sel),
      DIALOG,
      { timeout: 10000 }
    ).catch(() => {});
  }
}

async function ensureFollowing(page, manifest, bizId) {
  // Returns note about whether the follow was already active.
  const following = page.locator('button[aria-label^="Following"]');
  if ((await following.count()) > 0) {
    manifest.notes.push("follow: already in Following state (persisted), no click needed");
    return;
  }
  await page.locator('button[aria-label="Follow"]').first().click();
  await page.locator('button[aria-label^="Following"]').first().waitFor({ timeout: 15000 });
  manifest.notes.push("follow: clicked Follow, reached Following state");
}

async function ensureLiked(page, manifest) {
  const liked = page.locator('button[aria-label^="Liked"]');
  if ((await liked.count()) > 0) {
    manifest.notes.push("like: already in Liked state (persisted), no click needed");
    return;
  }
  await page.locator('button[aria-label="Like"]').first().click();
  await page.locator('button[aria-label^="Liked"]').first().waitFor({ timeout: 15000 });
  manifest.notes.push("like: clicked Like, reached Liked state");
}

async function runAskState(page, manifest) {
  await page.locator('button[aria-label="Ask FYD"]').first().click();
  const input = page.locator('input[aria-label^="Ask about"]');
  await input.waitFor({ timeout: 10000 });
  await input.fill("What services do you offer?");
  await page.locator(`${DIALOG} button[type="submit"]`).click();
  // Wait for either the answered or the no-evidence copy.
  const answered = page.locator('text=Answered from verified business evidence');
  const empty = page.locator('text=No evidence found');
  try {
    await Promise.race([
      answered.first().waitFor({ timeout: 30000 }),
      empty.first().waitFor({ timeout: 30000 }),
    ]);
    const which = (await answered.count()) > 0 ? "answered" : "no-evidence";
    manifest.notes.push(`ask: submitted question, result=${which}`);
  } catch {
    manifest.notes.push("ask: submitted question, no answer text observed within 30s (screenshot shows pending state)");
  }
  await sleep(600);
}

async function runBusiness(page, biz, vpName, manifest) {
  const idx = await buttonIndexFor(page, biz);
  const btn = page.locator(CIRCLE_BTN).nth(idx);
  const states = statesFor(vpName);

  const snap = async (state, extra = {}) => {
    const p = shotPath(biz.id, vpName, state);
    await page.screenshot({ path: p });
    manifest.shots.push({
      business: biz.id, viewport: vpName, state, path: p,
      dockActive: await dockActive(page),
      engagedDiameterPx: state === "collapsed" || state === "aware" ? null : await engagedDiameter(page),
      ...extra,
    });
  };

  for (const state of states) {
    if (state === "collapsed") {
      await closeEngaged(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(500);
      await snap("collapsed");
    } else if (state === "aware") {
      await btn.hover();
      await sleep(700); // hint tooltip transition is 180ms
      await snap("aware");
      await page.mouse.move(4, 4);
      await sleep(300);
    } else if (state === "engaged") {
      await btn.click();
      await page.locator(DIALOG).waitFor({ timeout: 15000 });
      await sleep(1200); // let the engage animation settle
      await snap("engaged");
    } else if (state === "ask") {
      await runAskState(page, manifest);
      await snap("ask");
      // Back out of the ask view to the engaged view.
      const back = page.locator(`${DIALOG} button:has-text("Back")`);
      if ((await back.count()) > 0) await back.first().click();
      await sleep(400);
    } else if (state === "following") {
      await ensureFollowing(page, manifest, biz.id);
      await sleep(400);
      await snap("following");
    } else if (state === "liked") {
      await ensureLiked(page, manifest);
      await sleep(400);
      await snap("liked");
    } else if (state === "narrow-fallback") {
      // Dock-mode engagement under scroll: the engaged circle is a fixed
      // overlay; the dock pill stays at the bottom edge.
      await page.evaluate(() => window.scrollTo(0, 600));
      await sleep(600);
      await snap("narrow-fallback");
    }
  }
  await closeEngaged(page);
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const manifest = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    browserVersion: browser.version(),
    notes: [],
    shots: [],
  };
  console.log(`browser: ${browser.version()}`);
  try {
    for (const vp of VIEWPORTS) {
      console.log(`viewport: ${vp.name}`);
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        ...(vp.deviceScaleFactor ? { deviceScaleFactor: vp.deviceScaleFactor } : {}),
        ...(vp.reducedMotion ? { reducedMotion: vp.reducedMotion } : {}),
      });
      for (const biz of BUSINESSES) {
        console.log(`  business: ${biz.id}`);
        const page = await context.newPage();
        try {
          await page.goto(BASE, { waitUntil: "load", timeout: 60000 });
          await waitCircles(page);
          await runBusiness(page, biz, vp.name, manifest);
        } catch (err) {
          manifest.notes.push(`ERROR ${vp.name}/${biz.id}: ${String(err && err.message || err)}`);
          console.error(`  ERROR ${biz.id}: ${err && err.message}`);
        } finally {
          await page.close();
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  const manifestPath = path.join(OUT, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`shots: ${manifest.shots.length}, manifest: ${manifestPath}`);
  const errors = manifest.notes.filter((n) => n.startsWith("ERROR"));
  if (errors.length > 0) {
    console.error(`errors: ${errors.length}`);
    process.exitCode = 2;
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
