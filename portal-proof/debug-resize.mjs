// Debug: check [data-ping-object] presence and resize-release behavior.
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3100/", { waitUntil: "load", timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
console.log("data-ping-object count:", await page.locator("[data-ping-object]").count());

// Track resize events in the page
await page.evaluate(() => {
  window.__resizes = 0;
  window.addEventListener("resize", () => { window.__resizes++; });
});

const btn = page.locator('button[aria-label$="Activate to expand."]').first();
await btn.click();
await page.waitForSelector('div[role="dialog"]', { timeout: 15000 });
console.log("engaged OK");
await page.setViewportSize({ width: 1280, height: 800 });
await new Promise((r) => setTimeout(r, 1000));
console.log("resize events seen:", await page.evaluate(() => window.__resizes));
console.log("dialog open 1s after resize:", await page.locator('div[role="dialog"]').count());
await new Promise((r) => setTimeout(r, 2500));
console.log("dialog open 3.5s after resize:", await page.locator('div[role="dialog"]').count());
await browser.close();
