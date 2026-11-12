/**
 * Actual EpisodePlayer DOM/lifecycle proof, without a provider or app server.
 * Run from the repository root: npx tsx scripts/verify-episode-player.ts
 *
 * Uses the repository's React UMD builds and TypeScript compiler to render the
 * shipped component in Chromium. Only the iframe response is controlled. No
 * video, subscriber, application API, or other production write is involved.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { chromium, expect, type Route } from "@playwright/test";

const root = process.cwd();
const componentSource = fs.readFileSync(path.join(root, "src/components/episode-player.tsx"), "utf8");
const compiled = ts.transpileModule(componentSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 600 } });
    const requests: Route[] = [];
    await page.route("https://player.example/**", (route) => {
      requests.push(route);
    });
    await page.setContent('<!doctype html><html><body><main id="root"></main></body></html>');
    await page.clock.install();
    await page.addScriptTag({
      content: fs.readFileSync(path.join(root, "node_modules/react/umd/react.development.js"), "utf8"),
    });
    await page.addScriptTag({
      content: fs.readFileSync(path.join(root, "node_modules/react-dom/umd/react-dom.development.js"), "utf8"),
    });
    await page.addScriptTag({
      content: `(() => {
        const module = { exports: {} };
        const exports = module.exports;
        function jsx(type, props, key) {
          return window.React.createElement(type, key === undefined ? props : { ...props, key });
        }
        function require(name) {
          if (name === "react") return window.React;
          if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: window.React.Fragment };
          throw new Error("Unexpected component dependency: " + name);
        }
        ${compiled}
        window.ReactDOM.createRoot(document.getElementById("root")).render(
          window.React.createElement(module.exports.EpisodePlayer, {
            title: "Fixture episode",
            embedUrl: "https://player.example/embed/fixture"
          })
        );
      })();`,
    });

    const loadButton = page.getByRole("button", { name: "Load episode player", exact: true });
    await expect(loadButton).toBeEnabled();
    assert.equal(await page.locator("iframe").count(), 0, "no iframe before viewer intent");
    assert.equal(requests.length, 0, "no provider request before viewer intent");
    await loadButton.click();
    await expect.poll(() => requests.length).toBe(1);
    const firstFrame = await page.locator("iframe").elementHandle();
    assert(firstFrame);
    await firstFrame.focus();
    await page.clock.fastForward(15001);
    await expect(page.getByRole("status")).toContainText("keep waiting");
    assert(await firstFrame.evaluate((el) => el.isConnected && el === document.querySelector("iframe")), "warning retains the original iframe");
    assert(await firstFrame.evaluate((el) => el === document.activeElement), "warning preserves focus inside the iframe");

    await requests[0].fulfill({ contentType: "text/html", body: "<!doctype html><title>Late frame</title><button>Play</button>" });
    await expect(page.getByRole("button", { name: "Reload player", exact: true })).toBeVisible();
    assert(await firstFrame.evaluate((el) => el.isConnected), "late load recovers the same iframe");
    await expect(page.getByRole("status")).toHaveText("If playback is unavailable, watch on YouTube below.");
    await page.getByRole("button", { name: "Go to video player", exact: true }).click();
    assert(await firstFrame.evaluate((el) => el === document.activeElement), "explicit player focus works");

    await page.getByRole("button", { name: "Reload player", exact: true }).click();
    await expect.poll(() => requests.length).toBe(2);
    assert.equal(await firstFrame.evaluate((el) => el.isConnected), false, "explicit reload replaces the iframe");
    const secondFrame = await page.locator("iframe").elementHandle();
    assert(secondFrame);
    await page.clock.fastForward(15001);
    const retryButton = page.getByRole("button", { name: "Retry player", exact: true });
    await expect(retryButton).toBeVisible();
    await retryButton.click();
    await expect.poll(() => requests.length).toBe(3);
    assert.equal(await secondFrame.evaluate((el) => el.isConnected), false, "explicit retry replaces the stalled iframe");
    assert(await page.getByRole("button", { name: "Requesting player…", exact: true }).evaluate((el) => el === document.activeElement), "retry leaves focus on its stable control");

    const thirdFrame = await page.locator("iframe").elementHandle();
    assert(thirdFrame);
    await thirdFrame.focus();
    await page.clock.fastForward(15001);
    await expect(page.getByRole("status")).toContainText("keep waiting");
    assert(await thirdFrame.evaluate((el) => el.isConnected && el === document.activeElement), "repeated timeout retains the frame and focus");
    await requests[2].fulfill({ contentType: "text/html", body: "<!doctype html><title>Recovered frame</title>" });
    await expect(page.getByRole("button", { name: "Reload player", exact: true })).toBeVisible();

    console.log(JSON.stringify({
      browser: browser.version(),
      passed: ["intent gate", "timeout retains iframe and focus", "late load recovery", "explicit reload", "explicit retry and focus", "repeated timeout recovery"],
      controlledProviderRequests: requests.length,
    }));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
