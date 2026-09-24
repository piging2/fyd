/**
 * LANE-LIN spike: prototype of the full machine-walkable trace.
 * Run from the repo root: npx tsx src/fyd/lineage/spike-trace.ts
 */
import * as React from "react";
(globalThis as any).React = React;
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { HAPPY_PLACE_GRAPH } from "@/fyd/proceduralize/__fixtures__/happy-place-graph";
import { COPPERSMITH_GRAPH } from "@/fyd/proceduralize/__fixtures__/coppersmith-graph";
import { generateSiteSpec } from "@/fyd/proceduralize/generator";
import {
  resolveQuery,
  renderSection,
  buildRenderContext,
} from "@/fyd/components/renderer";
import { canonicalize, buildAskContext, composeAnswer } from "@/lib/ping/ask-composer";
import type { ObjectGraph } from "@/fyd/sitespec/types";

const sha256 = (d: string | Buffer) =>
  createHash("sha256").update(d).digest("hex");

const REPO = "/home/nolan/projects/ping";

function checkSourceBytes(slug: string, files: string[], expectedConcat: string) {
  const bufs = files.map((f) => readFileSync(`${REPO}/src/fyd/proceduralize/raw/${slug}/${f}`));
  const concat = Buffer.concat(bufs);
  const got = sha256(concat);
  console.log(`SOURCE ${slug}: concat match=${got === expectedConcat} got=${got.slice(0,16)}...`);
  for (let i = 0; i < files.length; i++) {
    console.log(`  ${files[i]}: ${bufs[i].length} bytes sha256=${sha256(bufs[i]).slice(0, 16)}...`);
  }
}

function checkProjection(siteId: string, fixture: ObjectGraph) {
  const raw = readFileSync(`/home/nolan/ping/var/fyd-projections/${siteId}.json`, "utf8");
  const doc = JSON.parse(raw);
  const recomputed = sha256(canonicalize(doc.graph));
  console.log(`PROJECTION ${siteId}: graphDigest match=${recomputed === doc.meta.graphDigest}`);
  console.log(`  meta: dumpedAt=${doc.meta.dumpedAt} dumper=${doc.meta.dumperVersion} baseDigest=${String(doc.meta.baseDigest).slice(0, 12)}... eventSequences=${JSON.stringify(doc.meta.eventSequences)}`);
  const pg = doc.graph as ObjectGraph;
  console.log(`  objects=${pg.objects.length} rels=${pg.relationships.length} (fixture: ${fixture.objects.length}/${fixture.relationships.length})`);
  return pg;
}

function traceFact(siteId: string, graph: ObjectGraph, claim: string, question: string) {
  const obj = graph.objects.find((o) =>
    o.title.includes(claim) || o.description.includes(claim) ||
    Object.values(o.fields).some((v) => typeof v === "string" && v.includes(claim))
  );
  if (!obj) { console.log(`EVIDENCE ${siteId}: NO OBJECT MATCHES CLAIM`); return; }
  const fieldHit = obj.title.includes(claim) ? "title" : obj.description.includes(claim) ? "description" : "fields";
  console.log(`EVIDENCE ${siteId}: object=${obj.id} schema=${obj.schema} field=${fieldHit}`);
  console.log(`  provenance=${JSON.stringify(obj.provenance)}`);
  const rels = graph.relationships.filter((r) => r.object === obj.id);
  for (const r of rels) console.log(`  rel: ${r.id} ${r.predicate} evidenceRef=${r.evidenceRef}`);

  const spec = generateSiteSpec(graph, { generatedAt: "2026-09-21T12:00:00.000Z" });
  console.log(`SITESPEC ${siteId}: ownerObjectId=${spec.ownerObjectId} pages=${spec.pages.map((p) => p.slug).join(",")}`);
  for (const page of spec.pages) {
    for (const section of page.sections) {
      const bound = resolveQuery(section.query, graph, spec.ownerObjectId);
      if (bound.some((o) => o.id === obj.id) && section.component === "Services") {
        console.log(`  BINDING: page=${page.slug} section=${section.id} component=${section.component} binds=${bound.length} objects`);
        const ctx = buildRenderContext(spec, graph, { viewerId: null, displayName: null });
        const html = renderToStaticMarkup(renderSection(section, ctx, 0) as any);
        console.log(`  RENDER: markup ${html.length} chars; claim present=${html.includes(claim)}`);
        const idx = html.indexOf(claim);
        if (idx >= 0) console.log(`  RENDER excerpt: ...${html.slice(Math.max(0, idx - 60), idx + claim.length + 60)}...`);
      }
    }
  }

  const related = graph.objects.filter((o) => o.id !== obj.id && o.visibility === "public").slice(0, 5);
  const orels = graph.relationships.filter((r) => r.subject === obj.id || r.object === obj.id);
  const actx = buildAskContext({
    viewer: { id: null, displayName: null },
    target: obj,
    relatedObjects: related,
    relationships: orels,
    plan: null,
  });
  console.log(`ASK ${siteId}: evidenceRefs[0]=${actx.evidenceRefs[0]?.id} sourceUrls=${JSON.stringify(actx.sourceUrls)}`);
  const ans = composeAnswer(actx, question);
  console.log(`  Q: ${question}`);
  console.log(`  A: ${ans.answer.slice(0, 500)}`);
  console.log(`  claimClassifications=${JSON.stringify(ans.claimClassifications.map((c) => ({ cls: c.claimClass })))}`);
  console.log(`  partial=${ans.partial} unknowns=${JSON.stringify(ans.unknowns)}`);
}

checkSourceBytes("happy-place-platform", ["index.html"], "76766d18a3f054e1e545124d0cfc9f5d48e242d1b7c746e9ebc5dbf555936d78");
checkSourceBytes("coppersmith-plumbing", ["index.html", "rss.xml", "sitemap.xml"], "5e9f1433566b21e864a74f8e36950207465a67265a945f449fe72342c005a70e");

const hpGraph = checkProjection("happy-place", HAPPY_PLACE_GRAPH);
const copGraph = checkProjection("coppersmith-plumbing", COPPERSMITH_GRAPH);

traceFact(
  "coppersmith-plumbing",
  copGraph,
  "Are you working on new construction for residential homes or commercial buildings?",
  "Does Coppersmith offer plumbing for new construction?"
);
traceFact(
  "happy-place",
  hpGraph,
  "A fence should stay straight, the gate should close without dragging, and it should still look good after a few Oregon winters.",
  "What does Happy Place say about fencing?"
);
