// Trivial launch verification: opens the homepage, counts portal circles,
// prints their aria-labels. Run before the matrix.
//   LD_LIBRARY_PATH=~/browser-libs/usr/lib/x86_64-linux-gnu node portal-proof/verify-launch.mjs
import { chromium } from "playwright";

const BASE = process.env.PORTAL_BASE ?? "http://localhost:3100/";
const SEL = 'button[aria-label$="Activate to expand."]';

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
console.log("launched:", browser.version());
const page = await browser.newPage();
await page.goto(BASE, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(
  (s) => document.querySelectorAll(s).length >= 2,
  SEL,
  { timeout: 30000 }
);
const labels = await page.locator(SEL).evaluateAll((els) =>
  els.map((e) => e.getAttribute("aria-label"))
);
console.log("circle buttons found:", labels.length);
for (const l of labels) console.log(" -", l);
await browser.close();
console.log("VERIFY OK");
