/**
 * Entity-resolution spike demo (spike-1). Runnable: from the repo root,
 *
 *   npx tsx src/fyd/resolve/spike/demo.ts <corpus.jsonl> <candidates.jsonl>
 *
 * The demo resolves every candidate against the corpus and prints the
 * tier split: N candidates -> X EXACT / Y AMBIGUOUS / Z UNMATCHED, with
 * examples per tier. It also resolves the two real FYD proceduralizer
 * fixtures (Happy Place, Coppersmith) against the corpus.
 *
 * Data note: corpus/candidates are real outreach pipeline rows (PING
 * Social prospect research). The demo reads them from paths so no
 * production data is committed to the spike.
 */

import { readFileSync } from "node:fs";
import type { ResolveEntity, ResolutionDecision } from "./types.ts";
import { buildIndex, resolveAll, tierCounts } from "./resolve.ts";
import { COPPERSMITH_GRAPH } from "../../proceduralize/__fixtures__/coppersmith-graph.ts";
import { HAPPY_PLACE_GRAPH } from "../../proceduralize/__fixtures__/happy-place-graph.ts";

interface ProspectRow {
  business_name?: string;
  phone?: string;
  website?: string;
  city?: string;
  trade?: string;
  source?: string;
  _round_file?: string;
}

function prospectToEntity(row: ProspectRow, id: string): ResolveEntity {
  return {
    id,
    name: row.business_name ?? "",
    phone: row.phone,
    url: row.website,
    city: row.city,
    trade: row.trade,
    source: [row.source, row._round_file].filter(Boolean).join(" | "),
  };
}

function fixtureBusiness(graph: { objects: Array<{ id: string; schema: string; title: string; fields?: Record<string, string | string[]> }> }, id: string): ResolveEntity {
  const biz = graph.objects.find((o) => /business/.test(o.schema));
  const site = graph.objects.find((o) => /website/.test(o.schema));
  const fields = biz?.fields ?? {};
  const field = (k: string): string | undefined => {
    const v = fields[k];
    return typeof v === "string" ? v : undefined;
  };
  const siteFields = site?.fields ?? {};
  const siteUrl = typeof siteFields["url"] === "string" ? (siteFields["url"] as string) : field("website");
  return {
    id,
    name: field("title") ?? biz?.title ?? "",
    phone: field("phone"),
    url: siteUrl,
    source: "fyd proceduralizer fixture",
  };
}

function loadJsonl(path: string): ProspectRow[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as ProspectRow);
}

function main(): void {
  const [corpusPath, candidatesPath] = process.argv.slice(2);
  if (!corpusPath || !candidatesPath) {
    console.error("usage: npx tsx src/fyd/resolve/spike/demo.ts <corpus.jsonl> <candidates.jsonl>");
    process.exit(2);
  }
  const t0 = Date.now();
  const corpusRows = loadJsonl(corpusPath);
  const candidateRows = loadJsonl(candidatesPath);
  const corpusRef = `${corpusPath.split("/").pop()}@${corpusRows.length}`;
  const corpus: ResolveEntity[] = corpusRows.map((r, i) => prospectToEntity(r, `corpus:${i}:${(r.business_name ?? "?").slice(0, 40)}`));
  const candidates: ResolveEntity[] = candidateRows.map((r, i) =>
    prospectToEntity(r, `cand:${i}:${(r.business_name ?? "?").slice(0, 40)}`),
  );
  candidates.push(fixtureBusiness(COPPERSMITH_GRAPH as never, "fixture:coppersmith-plumbing"));
  candidates.push(fixtureBusiness(HAPPY_PLACE_GRAPH as never, "fixture:happy-place-carpentry"));

  const index = buildIndex(corpus);
  const decisions = resolveAll(candidates, corpus, { corpusRef });
  const counts = tierCounts(decisions);
  const ms = Date.now() - t0;

  console.log(`candidates: ${decisions.length} | corpus: ${corpus.length} (${corpusRef}) | ${ms}ms`);
  console.log(`EXACT: ${counts.EXACT}  AMBIGUOUS: ${counts.AMBIGUOUS}  UNMATCHED: ${counts.UNMATCHED}`);

  const byTier = (tier: "EXACT" | "AMBIGUOUS" | "UNMATCHED") =>
    decisions.filter((d) => d.tier === tier).slice(0, 4);

  const nameOf = (id: string): string => {
    const e = candidates.find((c) => c.id === id) ?? corpus.find((c) => c.id === id);
    return e ? `${e.name} [${id.split(":").slice(0, 2).join(":")}]` : id;
  };

  for (const d of byTier("EXACT")) {
    const c = candidates.find((x) => x.id === d.provenance.candidateId)!;
    const ex = d as Extract<ResolutionDecision, { tier: "EXACT" }>;
    console.log(`\n[EXACT] ${c.name}  rule=${ex.rule} evidence=${JSON.stringify(ex.evidence)}`);
    for (const m of ex.matchedIds.slice(0, 3)) console.log(`        -> ${nameOf(m)}`);
  }
  for (const d of byTier("AMBIGUOUS")) {
    const c = candidates.find((x) => x.id === d.provenance.candidateId)!;
    const am = d as Extract<ResolutionDecision, { tier: "AMBIGUOUS" }>;
    console.log(`\n[AMBIGUOUS] ${c.name}  action=${am.action}`);
    for (const cand of am.candidates.slice(0, 3)) {
      console.log(`        ~ ${cand.id} score=${cand.score} evidence=${JSON.stringify(cand.evidence)}`);
    }
  }
  for (const d of byTier("UNMATCHED")) {
    const c = candidates.find((x) => x.id === d.provenance.candidateId)!;
    console.log(`\n[UNMATCHED] ${c.name}`);
  }
}

main();
