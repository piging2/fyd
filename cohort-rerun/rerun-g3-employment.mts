// rerun-g3-employment.mts: G3 employment proof.
// For each of the 8 cohort businesses: extraction -> graph -> spec.
// Classify the 1.1.0 employs/works_for feature per business:
//   ACTIVE              employment rel in graph AND People section in spec
//   PROJECTION_DROPPED  employment rel in graph but generator did not use it
//   RESOLUTION_FAILED   employment observed (Person entity or works_for/
//                       employs candidate) but no rel survived
//   NEVER_OBSERVED      no Person entity and no employment candidate at all
// Run from /home/nolan/projects/ping:
//   NODE_OPTIONS="--import /home/nolan/css-register.mjs" ./node_modules/.bin/tsx cohort-rerun/rerun-g3-employment.mts
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runExtractionPipeline } from "/home/nolan/projects/ping/src/fyd/proceduralize/proceduralizer";
import { generateSiteSpec } from "/home/nolan/projects/ping/src/fyd/proceduralize/generator";

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
const observedAt = "2026-09-24T13:00:00Z";
const outDir = "/home/nolan/projects/ping/cohort-rerun";
mkdirSync(outDir, { recursive: true });

const EMPLOY_PREDICATES = new Set(["employs", "works_for"]);

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
  if (pages.length === 0) { rec.failure_stage = "fetch"; rec.employment = "NO_DATA"; results.push(rec); continue; }

  let out: Awaited<ReturnType<typeof runExtractionPipeline>>;
  try {
    out = await runExtractionPipeline(pages as never, { sourceUrl: site.source_url, observedAt, controllerId: "night_cohort" } as never);
  } catch (err) { rec.failure_stage = "extraction"; rec.failure_detail = String(err); results.push(rec); continue; }

  const graph = out.graph;
  const report = out.report;
  const personsObserved = report.entitiesByType["Person"] ?? 0;
  const personObjects = graph.objects.filter((o) => o.schema === "ping.social.person@1" && o.visibility === "public").length;
  const employmentRels = graph.relationships.filter((r) => EMPLOY_PREDICATES.has(r.predicate));
  const employmentDrops = report.relationshipDrops.filter(
    (d) => EMPLOY_PREDICATES.has(d.predicate) || d.subject.includes("-person-") || d.object.includes("-person-"),
  );
  const dropOutcomes: Record<string, number> = {};
  for (const d of employmentDrops) dropOutcomes[d.outcome] = (dropOutcomes[d.outcome] ?? 0) + 1;

  let spec: { pages: { slug: string; sections: { component: string }[] }[] } | null = null;
  try {
    spec = generateSiteSpec(
      { objects: graph.objects as never, relationships: graph.relationships as never },
      { generatedAt: observedAt },
    ) as never;
  } catch (err) { rec.failure_stage = "generate"; rec.failure_detail = String(err); results.push(rec); continue; }

  const peopleSection = (spec?.pages ?? []).some((p) => (p.sections ?? []).some((s) => s.component === "People"));

  let employment: string;
  const worksForEvidence = employmentRels.length + employmentDrops.length;
  if (employmentRels.length > 0 && peopleSection) employment = "ACTIVE";
  else if (employmentRels.length > 0) employment = "PROJECTION_DROPPED";
  else if (worksForEvidence > 0) employment = "RESOLUTION_FAILED";
  else employment = "NEVER_OBSERVED";

  // Overall drop-outcome histogram: proof the ledger is complete.
  const allDrops: Record<string, number> = {};
  for (const d of report.relationshipDrops) allDrops[d.outcome] = (allDrops[d.outcome] ?? 0) + 1;

  rec.persons_observed = personsObserved;
  rec.person_objects = personObjects;
  // Person objects with no employment edge to the owner: the 1.1.0
  // generator matches people only through employs/works_for, so these
  // never reach a People section.
  const linkedPersonIds = new Set<string>();
  for (const r of employmentRels) { linkedPersonIds.add(r.subject as string); linkedPersonIds.add(r.object as string); }
  rec.unlinked_person_objects = graph.objects.filter(
    (o) => o.schema === "ping.social.person@1" && o.visibility === "public" && !linkedPersonIds.has(o.id),
  ).length;
  rec.employment_rels = employmentRels.map((r) => `${r.subject} --${r.predicate}--> ${r.object}`);
  rec.employment_drops = employmentDrops;
  rec.employment_drop_outcomes = dropOutcomes;
  rec.people_section = peopleSection;
  rec.employment = employment;
  rec.relationship_drops_all = allDrops;
  rec.relationships_generated = graph.relationships.length;
  results.push(rec);
  console.log(JSON.stringify({
    site_id: site.site_id, personsObserved, personObjects,
    employmentRels: employmentRels.length, employmentDrops: employmentDrops.length,
    peopleSection, employment, allDrops,
  }));
}

writeFileSync(join(outDir, "rerun-g3-employment-results.json"), JSON.stringify(results, null, 2));
console.log("WROTE", join(outDir, "rerun-g3-employment-results.json"));
