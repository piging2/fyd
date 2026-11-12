/**
 * Browser regressions for SpatialCanvas focus, retry and arrow navigation.
 * Run against a local candidate server:
 *   BASE_URL=http://127.0.0.1:4320 npx tsx scripts/verify-spatial-recovery.ts
 * GET-only; failures and slow retries are intercepted in the browser.
 */
import assert from "node:assert/strict";
import { chromium, expect, type Page } from "@playwright/test";

const base = process.env.BASE_URL ?? "http://127.0.0.1:4320";
assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname), "Use a local candidate server");

async function openSpatial(page: Page) {
  await page.route("**/*", async (route) => {
    if (route.request().method() !== "GET") return route.abort();
    return route.continue();
  });
  await page.goto(`${base}/objects/spatial`, { waitUntil: "networkidle" });
  await expect(page.getByRole("button", { name: /service offered by/ }).first()).toBeVisible();
}

async function assertUnobscured(page: Page, selector: string) {
  const bounds = await page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const header = document.querySelector("header")?.getBoundingClientRect();
    return {
      focused: document.activeElement === element,
      top: rect.top,
      bottom: rect.bottom,
      headerBottom: header?.bottom ?? 0,
      viewportBottom: window.innerHeight,
    };
  });
  assert(bounds.focused, `Target lost focus: ${JSON.stringify(bounds)}`);
  assert(bounds.top >= bounds.headerBottom, `Target hidden under header: ${JSON.stringify(bounds)}`);
  assert(bounds.bottom <= bounds.viewportBottom, `Target below viewport: ${JSON.stringify(bounds)}`);
  return bounds;
}

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 400 }, reducedMotion: "reduce" });
    await openSpatial(page);
    const origin = page.getByRole("button", { name: /service offered by/ }).last();
    const originName = await origin.getAttribute("aria-label");
    await origin.click();
    await expect(page.getByRole("button", { name: /Back to Happy Place/ })).toBeVisible();
    const heading = await assertUnobscured(page, "h2[tabindex='-1']");

    const items = page.locator("ul.space-y-2 button");
    assert((await items.count()) >= 2, "Expected child navigation controls");
    await expect(items.first()).toHaveAttribute("tabindex", "0");
    await items.first().focus();
    await page.keyboard.press("ArrowUp");
    await expect(items.last()).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(items.first()).toBeFocused();

    await page.getByRole("button", { name: /Back to Happy Place/ }).click();
    await expect(page.getByRole("button", { name: originName!, exact: true })).toBeFocused();
    await assertUnobscured(page, "ul.space-y-2 button:focus");
    await page.close();

    const retryPage = await browser.newPage({ viewport: { width: 390, height: 400 }, reducedMotion: "reduce" });
    await openSpatial(retryPage);
    let attempts = 0;
    let finishRetry: (() => void) | undefined;
    await retryPage.route("**/api/fyd/objects/*", async (route) => {
      attempts += 1;
      if (attempts === 2) await new Promise<void>((resolve) => { finishRetry = resolve; });
      await route.fulfill({ status: 503, contentType: "application/json", body: '{"ok":false}' });
    });
    const retryOrigin = retryPage.getByRole("button", { name: /service offered by/ }).last();
    await retryOrigin.click();
    const retry = retryPage.getByRole("button", { name: /Retry loading/ });
    await expect(retry).toBeVisible();
    await retry.focus();
    await retry.press("Enter");
    await expect(retryOrigin).toBeFocused();
    await expect(retryOrigin).toHaveAttribute("aria-busy", "true");
    assert(finishRetry, "Retry request did not start");
    finishRetry();
    await expect(retry).toBeVisible();
    await expect(retryOrigin).toBeFocused();
    await assertUnobscured(retryPage, "ul.space-y-2 button:focus");
    await retryPage.close();

    const orbitPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
    await openSpatial(orbitPage);
    await expect(orbitPage.getByRole("button", { name: "Orbit", exact: true })).toHaveAttribute("aria-pressed", "true");
    const satellites = orbitPage.locator("button[aria-label*='service offered by']");
    await satellites.first().focus();
    await orbitPage.keyboard.press("ArrowRight");
    await expect(satellites.nth(1)).toBeFocused();
    await orbitPage.close();

    console.log(JSON.stringify({
      shortViewportHeading: heading,
      backRestoresVisibleOrigin: true,
      childArrowsWrapRenderedControls: true,
      repeatedRetryKeepsOriginFocus: true,
      desktopOrbitArrows: true,
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
