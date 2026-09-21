// Slot/dock probe: for each proof viewport, reports whether each portal
// circle is in a peripheral slot or in the bottom-edge dock.
// Usage: LD_LIBRARY_PATH=~/browser-libs/usr/lib/x86_64-linux-gnu node portal-proof/probe-slots.mjs
import { chromium } from "playwright";

const BASE = process.env.PORTAL_BASE ?? "http://localhost:3100/";
const VIEWPORTS = [
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "834x1112", width: 834, height: 1112 },
  { name: "390x844", width: 390, height: 844 },
  { name: "1440x900-zoom150", width: 960, height: 600, deviceScaleFactor: 1.5 },
  { name: "1440x900-reduced-motion", width: 1440, height: 900, reducedMotion: "reduce" },
];
const SEL = 'button[aria-label$="Activate to expand."]';

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const out = {};
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    ...(vp.deviceScaleFactor ? { deviceScaleFactor: vp.deviceScaleFactor } : {}),
    ...(vp.reducedMotion ? { reducedMotion: vp.reducedMotion } : {}),
  });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "load", timeout: 60000 });
  await page.waitForFunction((s) => document.querySelectorAll(s).length >= 2, SEL, { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500)); // slot manager settles
  out[vp.name] = await page.evaluate((s) => {
    const dock = document.querySelector('div[data-ping-host]:not([data-ping-slot])');
    return [...document.querySelectorAll(s)].map((b) => {
      const host = b.closest("[data-ping-host]");
      const label = b.getAttribute("aria-label") || "";
      const r = b.getBoundingClientRect();
      return {
        name: label.split(",")[0],
        placement: host && host.hasAttribute("data-ping-slot") ? "slot:" + host.getAttribute("data-ping-slot") : "dock",
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
      };
    }).concat([{ dockPillPresent: !!dock }]);
  }, SEL);
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
