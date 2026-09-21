import { chromium } from "playwright";
async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const info = await page.evaluate(() => {
      const main = document.querySelector("main, [role=main], article, [data-content]");
      const fixed = Array.from(document.querySelectorAll("*")).filter((el) => {
        const s = getComputedStyle(el);
        return (s.position === "fixed" || s.position === "sticky") && (el as HTMLElement).offsetHeight > 0;
      }).map((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const s = getComputedStyle(el);
        return { tag: (el as HTMLElement).tagName, cls: (el as HTMLElement).className.toString().slice(0, 60), pos: s.position, rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } };
      });
      // Content column via Container-like divs: sample a few section children widths
      const sections = Array.from(document.querySelectorAll("section")).slice(0, 6).map((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return { w: Math.round(r.width), x: Math.round(r.x) };
      });
      return {
        hasMain: !!main,
        mainRect: main ? (() => { const r = (main as HTMLElement).getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width) }; })() : null,
        bodyScrollWidth: document.body.scrollWidth,
        innerWidth: window.innerWidth,
        fixed: fixed.slice(0, 8),
        sections,
      };
    });
    console.log(JSON.stringify(info, null, 1));
  } finally {
    await browser.close();
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
