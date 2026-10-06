// rerun-g1.mts: G1 cohort rerun. 8 businesses through the CURRENT pipeline.
// For each: extraction -> graph -> generateSiteSpec -> page inventory.
// Compares Explore-page presence against the PRE-INVERSION eligibleComponents
// table (git 651e916d) to detect silent semantic drift.
// Run from /home/nolan/projects/ping:
//   NODE_OPTIONS="--import /home/nolan/css-register.mjs" ./node_modules/.bin/tsx cohort-rerun/rerun-g1.mts
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { runExtractionPipeline } from "/home/nolan/projects/ping/src/fyd/proceduralize/proceduralizer";
import { generateSiteSpec } from "/home/nolan/projects/ping/src/fyd/proceduralize/generator";
import { eligibleComponents as eligibleComponentsNew } from "/home/nolan/projects/ping/src/fyd/sitespec/schemas";

// --- PRE-INVERSION baseline table (git 651e916d, src/fyd/sitespec/schemas.ts) ---
const OLD_TABLE: Record<string, string[]> = {
  "ping.social.business@1": ["Hero","IdentityCard","BusinessSummary","Contact","CTA","Links","SocialProof","AskFYD","ObjectGrid","ObjectFeed"],
  "ping.social.service@1": ["Services","ObjectGrid","ObjectFeed","CTA"],
  "ping.social.post@1": ["Posts","ObjectGrid","ObjectFeed","RecentObjects"],
  "ping.social.product@1": ["Products","ObjectGrid","ObjectFeed"],
  "ping.social.location@1": ["Locations","ObjectGrid","ObjectFeed"],
  "ping.social.person@1": ["People","ObjectGrid","ObjectFeed"],
  "ping.social.article@1": ["Posts","ObjectGrid","ObjectFeed","RecentObjects"],
  "ping.knowledge.website@1": ["ObjectGrid","ObjectFeed"],
};
const SCHEMA_ROLES_OLD: Record<string, string[]> = {
  business: ["ping.social.business@1","ping.knowledge.business@1"],
  service: ["ping.social.service@1","ping.knowledge.service@1"],
  product: ["ping.social.product@1"],
  location: ["ping.social.location@1","ping.knowledge.location@1"],
  person: ["ping.social.person@1","ping.knowledge.person@1"],
  post: ["ping.social.post@1","ping.knowledge.post@1"],
  article: ["ping.social.article@1","ping.knowledge.article@1"],
};
function schemaRoleOld(schemaId: string): string | null {
  for (const role of Object.keys(SCHEMA_ROLES_OLD)) {
    if (SCHEMA_ROLES_OLD[role].includes(schemaId)) return role;
  }
  return null;
}
function eligibleComponentsOld(schemaId: string): string[] {
  const direct = OLD_TABLE[schemaId];
  if (direct) return direct;
  const role = schemaRoleOld(schemaId);
  if (role) {
    const via = OLD_TABLE[SCHEMA_ROLES_OLD[role][0]];
    if (via) return via;
  }
  return ["GenericObjectCard"];
}

interface Site { site_id: string; rawRoot: string; source_url: string; }
const SITES: Site[] = [
  { site_id: "bemis-electric", rawRoot: "/home/nolan/cohort-raw", source_url: "https://bemiselectric.com/" },
  { site_id: "gear-junction", rawRoot: "/home/nolan/cohort-raw", source_url: "https://gearjunction.com/" },
  { site_id: "dalby-cpa", rawRoot: "/home/nolan/cohort-raw", source_url: "https://dalbycpa.com/" },
  { site_id: "klik-boutique", rawRoot: "/home/nolan/cohort-raw", source_url: "https://klikboutique.com/" },
  { site_id: "suehiro", rawRoot: "/home/nolan/cohort-raw", source_url: "https://suehiro.example/" },
  { site_id: "bistro-317", rawRoot: "/home/nolan/cohort2-raw", source_url: "https://bistro317.com" },
  { site_id: "tt-hvac", rawRoot: "/home/nolan/cohort2-raw", source_url: "https://tthvac1.wixsite.com/tthvacllc" },
  { site_id: "legacy-coffee", rawRoot: "/home/nolan/cohort2-raw", source_url: "https://legacycoffee.example/" },
];
const observedAt = "2026-09-24T11:30:00Z";
const outDir = "/home/nolan/projects/ping/cohort-rerun";
mkdirSync(outDir, { recursive: true });
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

const results: Record<string, unknown>[] = [];

for (const site of SITES) {
  const dir = join(site.rawRoot, site.site_id);
  const manPath = join(dir, "manifest.jsonl");
  const manLines = existsSync(manPath) ? readFileSync(manPath, "utf8").split("\n").filter((l) => l.trim()) : [];
  const pages: { url: string; sourceType: "html"; discoveredAt: string; raw: string; ok: boolean; status: number }[] = [];
  for (const line of manLines) {
    let e: Record<string, unknown>;
    try { e = JSON.parse(line); } catch { continue; }
    if (typeof e.page !== "string") continue;
    const pg = String(e.page);
    let htmlFile: string | null = null;
    if (pg === "home") htmlFile = "page-00-home.html";
    else { const m = pg.match(/^subpage-(\d+)$/); if (m) htmlFile = "page-" + String(Number(m[1])).padStart(2, "0") + ".html"; }
    if (!htmlFile || !existsSync(join(dir, htmlFile))) continue;
    const raw = readFileSync(join(dir, htmlFile), "utf8");
    const st = Number(e.status ?? 0);
    if (st === 200 && raw.length > 0) {
      pages.push({ url: String(e.url), sourceType: "html", discoveredAt: observedAt, raw, ok: true, status: st });
    }
  }
  const rec: Record<string, unknown> = { site_id: site.site_id, pages_ok: pages.length };
  if (pages.length === 0) { rec.failure_stage = "fetch"; results.push(rec); continue; }
  let graph: { objects: { id: string; schema: string; visibility: string }[]; relationships: unknown[] };
  try {
    const out = await runExtractionPipeline(pages as never, { sourceUrl: site.source_url, observedAt, controllerId: "night_cohort" } as never);
    graph = out.graph as never;
  } catch (err) { rec.failure_stage = "extraction"; rec.failure_detail = String(err); results.push(rec); continue; }
  const objects = graph.objects ?? [];
  let spec: { pages: { slug: string }[] } | null = null;
  try {
    spec = generateSiteSpec({ objects: objects as never, relationships: (graph.relationships ?? []) as never }, { generatedAt: observedAt }) as never;
  } catch (err) { rec.failure_stage = "generate"; rec.failure_detail = String(err); results.push(rec); continue; }

  const publicObjects = objects.filter((o) => o.visibility === "public");
  const schemas = [...new Set(publicObjects.map((o) => o.schema))].sort();
  const feedNew = schemas.filter((s) => eligibleComponentsNew(s).includes("ObjectFeed")).sort();
  const feedOld = schemas.filter((s) => eligibleComponentsOld(s).includes("ObjectFeed")).sort();
  const pageSlugs = spec.pages.map((p) => p.slug);
  const exploreNew = pageSlugs.includes("explore");
  // Baseline: what explorePage would have decided under the old table.
  const exploreOld = publicObjects.length >= 4 && feedOld.length > 0;
  rec.pages = pageSlugs;
  rec.public_objects = publicObjects.length;
  rec.object_schemas = schemas;
  rec.feed_schemas_new = feedNew;
  rec.feed_schemas_old = feedOld;
  rec.explore_present_new = exploreNew;
  rec.explore_present_old = exploreOld;
  rec.drift = exploreOld !== exploreNew ? "EXPLORE_PAGE_DRIFT" : "none";
  results.push(rec);
  console.log(JSON.stringify({ site_id: site.site_id, pages: pageSlugs, public: publicObjects.length, schemas, feedNew, feedOld, exploreNew, exploreOld }));
}

writeFileSync(join(outDir, "rerun-g1-results.json"), JSON.stringify(results, null, 2));
console.log("WROTE", join(outDir, "rerun-g1-results.json"));
