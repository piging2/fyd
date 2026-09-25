/**
 * Build-host media ingest runner. Node-only; run from the repo root:
 *
 *   npx tsx src/fyd/media/run-ingest.ts happy-place
 *   npx tsx src/fyd/media/run-ingest.ts coppersmith-plumbing
 *
 * Discovers images on the business site(s), fetches them through the SSRF
 * gate, digests, dedupes, generates derivatives into public/fyd-media/,
 * and writes src/fyd/media/manifests/<siteId>.json.
 *
 * DEMO AUTHORIZATION (Nolan 2026-09-25): for the two explicitly
 * authorized demo businesses, the runner may name explicit
 * authorizedSources with an authorizedBasis sentence. The authorization
 * is per-source, demo-scoped, and recorded in provenance; it is NOT a
 * general public-media-mirroring policy.
 *
 * Preview/experimental runs:
 *
 *   npx tsx src/fyd/media/run-ingest.ts happy-place --preview
 *
 * write to src/fyd/media/manifests/preview/<siteId>.<runId>.json and are
 * stamped preview: true. The production read path (bundle-media.ts)
 * never scans that directory and rejects preview-marked manifests even
 * if one were copied into the production dir: a preview artifact is
 * structurally incapable of becoming production truth.
 */

import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { ingestSiteMedia, type AuthorizedSource } from "./ingest";

interface SiteDef {
  pages: string[];
  businessSlug: string;
  authorizedSources?: AuthorizedSource[];
  authorizedBasis?: string;
  authorizedSourcePage?: string;
}

const HAPPY_PLACE_DEMO_BASIS =
  "Demo authorization (Nolan 2026-09-25): public marketing imagery of the " +
  "authorized demo business Happy Place Carpentry, observed on the business's " +
  "own website 2026-09-21 (live origin currently unreachable), hosted in the " +
  "business's own public Vercel blob bucket. Acquired for the FYD demo only. " +
  "FYD claims no copyright; the business retains all rights.";

const SITES: Record<string, SiteDef> = {
  "happy-place": {
    pages: ["https://happyplacecarpentry.com/"],
    businessSlug: "happy-place",
    // The live origin currently 302-redirects to gmail.com, so page
    // discovery finds no acquirable imagery. These are the business's own
    // public marketing photos, discovered on the business's own site
    // (snapshot 2026-09-21) in its own public Vercel blob bucket.
    // Explicitly authorized for the FYD demo only (basis above).
    authorizedSourcePage:
      "https://happyplacecarpentry.com/ (site snapshot 2026-09-21)",
    authorizedBasis: HAPPY_PLACE_DEMO_BASIS,
    authorizedSources: [
      {
        url: "https://8zci9xnviilmi6qj.public.blob.vercel-storage.com/2a1d4ae6e3b81282259174af113bac3c-1080-d420ae91d8e4.webp",
        title: "Happy Place Carpentry project photo 1",
      },
      {
        url: "https://8zci9xnviilmi6qj.public.blob.vercel-storage.com/6fd33914d4c27fbf71871bbc6405ff1c-1080-77bad689a781.webp",
        title: "Happy Place Carpentry project photo 2",
      },
      {
        url: "https://8zci9xnviilmi6qj.public.blob.vercel-storage.com/8151ae20b8c6b889b35dbd5571fa4d84-1080-93a3c6b3011d.webp",
        title: "Happy Place Carpentry project photo 3",
      },
      {
        url: "https://8zci9xnviilmi6qj.public.blob.vercel-storage.com/f3272a08fa5696f588d0780b26d34381-1080-65195680aa8d.webp",
        title: "Happy Place Carpentry project photo 4",
      },
      {
        url: "https://8zci9xnviilmi6qj.public.blob.vercel-storage.com/a2e488b435a03af26f7f75df8606f517-1080-fe45a5cee603.webp",
        title: "Happy Place Carpentry project photo 5",
      },
    ],
  },
  "coppersmith-plumbing": {
    pages: ["https://www.coppersmithplumbing.com/"],
    businessSlug: "coppersmith",
  },
};

async function main() {
  const siteId = process.argv[2];
  const preview = process.argv.includes("--preview");
  const def = siteId ? SITES[siteId] : undefined;
  if (!def) {
    console.error("usage: tsx src/fyd/media/run-ingest.ts <siteId> [--preview]");
    console.error("known: " + Object.keys(SITES).join(", "));
    process.exit(2);
  }
  const manifestPath = preview
    ? join(
        process.cwd(),
        "src",
        "fyd",
        "media",
        "manifests",
        "preview",
        siteId + "." + randomUUID() + ".json",
      )
    : join(
        process.cwd(),
        "src",
        "fyd",
        "media",
        "manifests",
        siteId + ".json",
      );
  const manifest = await ingestSiteMedia({
    siteId,
    businessSlug: def.businessSlug,
    pages: def.pages,
    publicDir: join(process.cwd(), "public", "fyd-media"),
    manifestPath,
    preview,
    authorizedSources: def.authorizedSources,
    authorizedBasis: def.authorizedBasis,
    authorizedSourcePage: def.authorizedSourcePage,
  });
  const ok = manifest.observations.filter((o) => o.outcome === "ingested").length;
  const failed = manifest.observations.filter((o) => o.outcome === "failed").length;
  const rejected = manifest.observations.filter((o) => o.outcome === "rejected").length;
  const dupes = manifest.observations.filter((o) => o.outcome === "duplicate").length;
  console.log(
    JSON.stringify({
      siteId,
      preview,
      manifestPath,
      ingested: ok,
      failed,
      rejected,
      duplicates: dupes,
      mediaObjects: manifest.media.length,
    }),
  );
  for (const o of manifest.observations) {
    if (o.outcome !== "ingested") console.log(" -", o.outcome, o.sourceUrl, o.reason ?? "");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
