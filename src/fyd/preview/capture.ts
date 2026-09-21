/**
 * Snapshot capture for portal circle previews (MODE A).
 *
 * Usage: npx tsx src/fyd/preview/capture.ts <objectId> <url>
 *
 * Captures the authorized public website above the fold with headless
 * Chromium, generates bounded sharp derivatives (reuses
 * src/fyd/media/derivatives.ts), and writes a provenance-carrying preview
 * manifest to src/fyd/preview/manifests/<objectId>.json.
 *
 * Deterministic: same URL + viewport -> same manifest shape. The focal
 * point defaults to the upper-center hero zone via resolveFocal.
 *
 * Visual verification before acceptance (FL-20260921-216): always open
 * and eyeball the captured screenshot before accepting the manifest.
 * A Google sign-in page was once captured and shipped as Happy Place
 * snapshot media; the junk capture was deleted and re-captured from the
 * correct URL. A screenshot that does not show the target business's
 * public website is junk: delete the manifest and digest directory,
 * never ship it.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { generateDerivatives, hashContentBytes } from "../media/derivatives";
import { resolveFocal } from "./focal";

const VIEWPORT = { width: 1440, height: 900 };
const NAV_TIMEOUT_MS = 25000;
const SETTLE_MS = 1500;

async function main(): Promise<void> {
  const objectId = process.argv[2] ?? "";
  const url = process.argv[3] ?? "";
  if (!/^[a-z0-9-]+$/.test(objectId)) {
    throw new Error("objectId must be lowercase letters, digits, or dashes");
  }
  if (!/^https:\/\//i.test(url)) {
    throw new Error("url must be an https URL");
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.goto(url, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
    await page.waitForTimeout(SETTLE_MS);
    const shot = await page.screenshot({ type: "png" });
    const digest = hashContentBytes(shot);
    const repoRoot = process.cwd();
    const publicDir = join(repoRoot, "public", "fyd-media");
    const generated = await generateDerivatives(Buffer.from(shot), digest, publicDir);

    const webp = generated.variants.filter((v) => v.format === "webp");
    // Engaged portal needs ~2x the max 480px diameter: smallest variant >= 800w, else largest.
    const sorted = [...webp].sort((a, b) => a.width - b.width);
    const engaged =
      sorted.find((v) => v.width >= 800) ?? sorted[sorted.length - 1];
    const thumb = sorted[0] ?? engaged;
    const srcSet = sorted.map((v) => `${v.url} ${v.width}w`).join(", ");
    const focal = resolveFocal({});

    const manifest = {
      src: engaged.url,
      srcSet,
      thumbSrc: thumb.url,
      width: engaged.width,
      height: engaged.height,
      focalX: focal.focal.x,
      focalY: focal.focal.y,
      basis: focal.basis,
      provenance: {
        source: "website-snapshot",
        capturedAt: new Date().toISOString(),
        captureMethod: "playwright-chromium-headless",
        digest,
        url,
      },
    };
    const manifestDir = join(repoRoot, "src", "fyd", "preview", "manifests");
    mkdirSync(manifestDir, { recursive: true });
    writeFileSync(
      join(manifestDir, objectId + ".json"),
      JSON.stringify(manifest, null, 2) + "\n",
    );
    const shortHash = createHash("sha256").update(url).digest("hex").slice(0, 12);
    console.log(
      `OK objectId=${objectId} digest=${digest.slice(0, 12)} engaged=${engaged.url} urlhash=${shortHash}`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error("capture failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
