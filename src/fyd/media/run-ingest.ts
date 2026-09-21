/**
 * Build-host media ingest runner. Node-only; run from the repo root:
 *
 *   npx tsx src/fyd/media/run-ingest.ts happy-place
 *   npx tsx src/fyd/media/run-ingest.ts coppersmith-plumbing
 *
 * Discovers images on the business site(s), fetches them through the SSRF
 * gate, digests, dedupes, generates derivatives into public/fyd-media/,
 * and writes src/fyd/media/manifests/<siteId>.json.
 */

import { join } from "node:path";
import { ingestSiteMedia } from "./ingest";

const SITES: Record<string, { pages: string[]; businessSlug: string }> = {
  "happy-place": {
    pages: ["https://happyplacecarpentry.com/"],
    businessSlug: "happy-place",
  },
  "coppersmith-plumbing": {
    pages: ["https://www.coppersmithplumbing.com/"],
    businessSlug: "coppersmith",
  },
};

async function main() {
  const siteId = process.argv[2];
  const def = siteId ? SITES[siteId] : undefined;
  if (!def) {
    console.error("usage: tsx src/fyd/media/run-ingest.ts <siteId>");
    console.error("known: " + Object.keys(SITES).join(", "));
    process.exit(2);
  }
  const manifest = await ingestSiteMedia({
    siteId,
    businessSlug: def.businessSlug,
    pages: def.pages,
    publicDir: join(process.cwd(), "public", "fyd-media"),
    manifestPath: join(process.cwd(), "src", "fyd", "media", "manifests", siteId + ".json"),
  });
  const ok = manifest.observations.filter((o) => o.outcome === "ingested").length;
  const failed = manifest.observations.filter((o) => o.outcome === "failed").length;
  const rejected = manifest.observations.filter((o) => o.outcome === "rejected").length;
  const dupes = manifest.observations.filter((o) => o.outcome === "duplicate").length;
  console.log(
    JSON.stringify({ siteId, ingested: ok, failed, rejected, duplicates: dupes, mediaObjects: manifest.media.length }),
  );
  for (const o of manifest.observations) {
    if (o.outcome !== "ingested") console.log(" -", o.outcome, o.sourceUrl, o.reason ?? "");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
