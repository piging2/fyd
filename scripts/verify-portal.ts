/**
 * Portal visual verification: collapsed / aware / engaged states,
 * diameter measurements, and host-content occlusion proof.
 * Usage: npx tsx /tmp/verify-portal.ts
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3102/";

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    // Locate collapsed circles by their accessible names.
    const hpBtn = page.getByRole("button", { name: /Happy Place/ });
    const csBtn = page.getByRole("button", { name: /Coppersmith/ });
    const hpCount = await hpBtn.count();
    const csCount = await csBtn.count();
    console.log("collapsed buttons found:", { hp: hpCount, cs: csCount });

    const hpBox = hpCount ? await hpBtn.first().boundingBox() : null;
    const csBox = csCount ? await csBtn.first().boundingBox() : null;
    console.log("collapsed diameters:", {
      hp: hpBox ? Math.round(hpBox.width) : null,
      cs: csBox ? Math.round(csBox.width) : null,
    });
    console.log("collapsed positions:", {
      hp: hpBox ? { x: Math.round(hpBox.x), y: Math.round(hpBox.y) } : null,
      cs: csBox ? { x: Math.round(csBox.x), y: Math.round(csBox.y) } : null,
    });
    await page.screenshot({ path: "/tmp/shots/v-collapsed.png" });

    if (hpCount) {
      await hpBtn.first().hover();
      await page.waitForTimeout(700);
      const awareBox = await hpBtn.first().boundingBox();
      console.log("aware diameter (hp):", awareBox ? Math.round(awareBox.width) : null);
      await page.screenshot({ path: "/tmp/shots/v-aware.png" });

      await hpBtn.first().click();
      await page.waitForTimeout(1400);
      const dialog = page.getByRole("dialog");
      const dCount = await dialog.count();
      console.log("engaged dialog found:", dCount);
      const dBox = dCount ? await dialog.first().boundingBox() : null;
      // The circle inside the dialog wrap: find the rounded-full motion div.
      const circleSize = await dialog.first().evaluate((el) => {
        const inner = el.querySelector("div > div");
        if (!inner) return null;
        const r = (inner as HTMLElement).getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) };
      });
      console.log("engaged circle:", circleSize);
      await page.screenshot({ path: "/tmp/shots/v-engaged.png" });

      // Occlusion proof: the engaged circle must (a) sit fully inside the
      // viewport, and (b) not intersect the host's visual content column.
      // Full-bleed section backgrounds do not count as content.
      const occlusion = await page.evaluate(() => {
        const dlg = document.querySelector('[role="dialog"]');
        if (!dlg) return { error: "no dialog" };
        const inner = dlg.querySelector("div > div") as HTMLElement | null;
        if (!inner) return { error: "no inner circle" };
        const c = inner.getBoundingClientRect();
        const cx = c.x + c.width / 2;
        const cy = c.y + c.height / 2;
        const r = c.width / 2;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const inViewport = c.x >= -1 && c.y >= -1 && c.x + c.width <= vw + 1 && c.y + c.height <= vh + 1;
        // Recompute the visual content column (same heuristic as the slot manager).
        const scope = document.querySelector("main") ?? document.body;
        let left = Infinity;
        let right = -Infinity;
        let hits = 0;
        const els = Array.from(scope.querySelectorAll("div, section, article")).slice(0, 500);
        for (const el of els) {
          const h = el as HTMLElement;
          if (h.closest("[data-ping-host]")) continue;
          if (h.offsetParent === null && h !== document.body) continue;
          const b = h.getBoundingClientRect();
          if (b.height < 40 || b.width < vw * 0.3 || b.width > vw * 0.96) continue;
          if (Math.abs(b.x + b.width / 2 - vw / 2) > vw * 0.06) continue;
          const p = h.parentElement;
          if (!p || p.closest("[data-ping-host]")) continue;
          if (p.getBoundingClientRect().width < b.width + 40) continue;
          let pos = "";
          try {
            pos = window.getComputedStyle(h).position;
          } catch {
            continue;
          }
          if (pos === "fixed" || pos === "sticky") continue;
          hits++;
          left = Math.min(left, b.x);
          right = Math.max(right, b.x + b.width);
        }
        const col = hits >= 2 ? { left, right } : { left: 0, right: vw };
        // Circle vs column rect intersection.
        const nx = Math.max(col.left, Math.min(cx, col.right));
        const ny = Math.max(0, Math.min(cy, vh));
        const dx = cx - nx;
        const dy = cy - ny;
        const intersectsColumn = dx * dx + dy * dy < r * r;
        return {
          circle: { x: Math.round(c.x), y: Math.round(c.y), d: Math.round(c.width) },
          inViewport,
          contentColumn: { left: Math.round(col.left), right: Math.round(col.right), hits },
          intersectsContentColumn: intersectsColumn,
        };
      });
      console.log("occlusion:", JSON.stringify(occlusion));

      // Close via Escape.
      await page.keyboard.press("Escape");
      await page.waitForTimeout(600);
      console.log("dialog after escape:", await page.getByRole("dialog").count());
      await page.screenshot({ path: "/tmp/shots/v-rest.png" });
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("VERIFY_FAILED", e.message);
  process.exit(1);
});
