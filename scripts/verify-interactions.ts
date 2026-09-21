/**
 * Portal interaction verification: ask, follow, like, scroll-collapse,
 * mobile dock, animation frame timing.
 * Usage: npx tsx scripts/verify-interactions.ts
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3102/";

async function main() {
  const browser = await chromium.launch();
  try {
    // ---------- Desktop interactions ----------
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(6000);

    const hpBtn = page.getByRole("button", { name: /Happy Place/ });

    // Frame timing during REST -> ENGAGED: start rAF sampling, then click.
    // (Browser code passed as a string: tsx must not compile it.)
    const measurePromise = page.evaluate(
      `new Promise((resolve) => {
        const out = [];
        let last = performance.now();
        let n = 0;
        function tick(t) {
          out.push(t - last);
          last = t;
          if (++n < 120) requestAnimationFrame(tick);
          else resolve(out);
        }
        requestAnimationFrame(tick);
      })`,
    );
    await page.waitForTimeout(80);
    await hpBtn.first().click();
    const dts = await measurePromise;
    await page.waitForTimeout(1200);
    const worst = Math.max(...dts);
    const p95 = dts.sort((a, b) => a - b)[Math.floor(dts.length * 0.95)];
    console.log("engage frame timing ms:", {
      frames: dts.length,
      worst: Math.round(worst),
      p95: Math.round(p95),
    });

    // Ask flow.
    const askBtn = page.getByRole("button", { name: "Ask FYD" });
    await askBtn.click();
    await page.waitForTimeout(400);
    const input = page.getByLabel(/Ask about/);
    await input.fill("What services do you offer?");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    await page.waitForTimeout(6000);
    const askText = await page.getByRole("dialog").innerText();
    const hasNoEvidence = askText.includes("I do not have evidence for that yet.");
    const hasAnswer = /Answered from verified business evidence|No evidence found/.test(askText);
    console.log("ask:", { hasNoEvidence, hasAnswer, chars: askText.length });
    await page.screenshot({ path: "/tmp/shots/v-ask.png" });
    // Back to circle interior.
    await page.getByRole("button", { name: "Back" }).click();
    await page.waitForTimeout(400);

    // Follow toggle.
    const followBtn = page.getByRole("button", { name: "Follow" });
    const followVisible = (await followBtn.count()) > 0;
    if (followVisible) {
      await followBtn.click();
      await page.waitForTimeout(800);
      const following = await page.getByRole("button", { name: "Following" }).count();
      console.log("follow toggled:", following > 0);
      // Toggle back off for idempotence.
      if (following > 0) {
        await page.getByRole("button", { name: "Following" }).click();
        await page.waitForTimeout(800);
      }
    } else {
      console.log("follow button not found");
    }

    // Like toggle.
    const likeBtn = page.getByRole("button", { name: "Like" });
    if ((await likeBtn.count()) > 0) {
      await likeBtn.click();
      await page.waitForTimeout(800);
      const liked = await page.getByRole("button", { name: "Liked" }).count();
      console.log("like toggled:", liked > 0);
      if (liked > 0) {
        await page.getByRole("button", { name: "Liked" }).click();
        await page.waitForTimeout(800);
      }
    } else {
      console.log("like button not found");
    }

    // Scroll while engaged collapses.
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(800);
    console.log("dialog after scroll:", await page.getByRole("dialog").count());
    console.log("page errors:", errors.length ? errors : "none");
    await page.close();

    // ---------- Mobile dock ----------
    const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await m.goto(BASE, { waitUntil: "networkidle" });
    await m.waitForTimeout(6000);
    const mHp = m.getByRole("button", { name: /Happy Place/ });
    const mBox = (await mHp.count()) ? await mHp.first().boundingBox() : null;
    console.log("mobile collapsed:", mBox ? { w: Math.round(mBox.width), x: Math.round(mBox.x), y: Math.round(mBox.y) } : null);
    await m.screenshot({ path: "/tmp/shots/v-mobile-dock.png" });
    if (await mHp.count()) {
      await mHp.first().click();
      await m.waitForTimeout(1400);
      const md = m.getByRole("dialog");
      const mdBox = (await md.count()) ? await md.first().boundingBox() : null;
      const inner = (await md.count())
        ? await md.first().evaluate((el) => {
            const i = el.querySelector("div > div");
            if (!i) return null;
            const r = (i as HTMLElement).getBoundingClientRect();
            return { w: Math.round(r.width), x: Math.round(r.x), y: Math.round(r.y), bottom: Math.round(r.y + r.height) };
          })
        : null;
      console.log("mobile engaged inner:", inner, "viewportH: 844");
      await m.screenshot({ path: "/tmp/shots/v-mobile-engaged.png" });
    }
    await m.close();

    // ---------- Reduced motion ----------
    const rm = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      reducedMotion: "reduce",
    });
    await rm.goto(BASE, { waitUntil: "networkidle" });
    await rm.waitForTimeout(6000);
    const rmHp = rm.getByRole("button", { name: /Happy Place/ });
    if (await rmHp.count()) {
      await rmHp.first().click();
      await rm.waitForTimeout(800);
      console.log("reduced-motion dialog:", await rm.getByRole("dialog").count());
      await rm.screenshot({ path: "/tmp/shots/v-reduced-motion.png" });
    }
    await rm.close();
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("VERIFY_FAILED", e.message);
  process.exit(1);
});
