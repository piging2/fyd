// Debug 2: does a window resize cause slot recompute + re-render?
// Records the OTHER (collapsed) circle's x before/after resize while
// Happy Place is engaged.
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3100/", { waitUntil: "load", timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));

const btns = page.locator('button[aria-label$="Activate to expand."]');
await btns.first().click();
await page.waitForSelector('div[role="dialog"]', { timeout: 15000 });

const xBefore = await btns.nth(1).evaluate((b) => Math.round(b.getBoundingClientRect().x));
console.log("coppersmith x before resize:", xBefore);
await page.setViewportSize({ width: 1280, height: 800 });
await new Promise((r) => setTimeout(r, 1200));
const xAfter = await btns.nth(1).evaluate((b) => Math.round(b.getBoundingClientRect().x));
console.log("coppersmith x after resize:", xAfter);
console.log("moved:", xBefore !== xAfter);
console.log("dialog still open:", (await page.locator('div[role="dialog"]').count()) > 0);
await browser.close();
