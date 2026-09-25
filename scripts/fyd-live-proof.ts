/**
 * FYD live acquisition proof (Track F, 2026-09-25).
 *
 * Run from the repo root on the Pig:
 *   npx tsx scripts/fyd-live-proof.ts
 *
 * Proves, against the real network:
 *  (a) good URL -> full graph -> generated site, for each demo business's
 *      recorded real website, re-acquired live (replaces fixture-backed
 *      acquisition with the real path);
 *  (b) hostile URLs fail closed with typed codes: private IP literal,
 *      metadata endpoint, 404, non-HTML, timeout.
 *
 * Writes a JSON evidence file to /tmp/fyd-live-proof-<ts>.json and prints
 * a human-readable summary. Exits 0 when every expectation holds, 1
 * otherwise. Media runs for the two authorized demo tenants only.
 */

import { writeFile } from "node:fs/promises";
import { runLiveLoop, type LiveLoopResult } from "@/fyd/acquisition/live-loop";
import { classifyFetchFailure } from "@/fyd/acquisition/errors";
import { safeFetchPage } from "@/fyd/net/safe-fetch";

interface CaseResult {
  name: string;
  expected: string;
  got: string | null;
  pass: boolean;
  detail: string;
}

const results: CaseResult[] = [];
const loopResults: Record<string, LiveLoopResult> = {};

function check(name: string, expected: string, got: string | null, detail: string): void {
  const pass = expected === got;
  results.push({ name, expected, got, pass, detail });
  console.log((pass ? "PASS" : "FAIL") + " " + name + " | expected=" + expected + " got=" + got);
  if (!pass) console.log("     detail: " + detail.slice(0, 300));
}

function summarizeLoop(name: string, r: LiveLoopResult): string {
  const rep = r.report;
  const stages = rep.stages.map((s) => s.stage + ":" + s.status).join(" ");
  const media = rep.media ? " media=" + rep.media.status + "(" + rep.media.ingested + "ing/" + rep.media.rejected + "rej)" : "";
  return (
    "stages[" + stages + "] objects=" + rep.graphSummary.objects +
    " rels=" + rep.graphSummary.relationships +
    " pages=" + (rep.specSummary?.pages ?? 0) +
    " sections=" + (rep.specSummary?.sections ?? 0) +
    " renderable=" + rep.specSummary?.renderable + media
  );
}

async function main(): Promise<void> {
  console.log("=== FYD live acquisition proof ===");

  // (a) The two authorized demo businesses, re-acquired live.
  console.log("\n-- good URL: Happy Place (authorized demo) --");
  const happy = await runLiveLoop({
    url: "https://happy-place-platform.vercel.app/",
    tenantId: "happy-place-live",
    onProgress: (s) => console.log("   stage " + s.stage + ": " + s.status + " (" + s.ms + "ms) " + s.detail.slice(0, 160)),
  });
  loopResults["happy-place-live"] = happy;
  check(
    "happy-place live loop",
    "null",
    happy.report.error ? happy.report.error.code : "null",
    summarizeLoop("happy", happy),
  );
  console.log("   " + summarizeLoop("happy", happy));
  if (!happy.report.error) {
    check("happy-place renderable", "true", String(happy.renderable), "");
    check("happy-place has objects", ">0", happy.report.graphSummary.objects > 0 ? ">0" : "0", JSON.stringify(happy.report.graphSummary.schemas));
    check("happy-place media ran", "ok", happy.report.media?.status ?? "null", happy.report.media?.reason ?? "");
  }

  console.log("\n-- good URL: Coppersmith Plumbing (authorized demo) --");
  const copper = await runLiveLoop({
    url: "https://www.coppersmithplumbing.com/",
    tenantId: "coppersmith-plumbing-live",
    onProgress: (s) => console.log("   stage " + s.stage + ": " + s.status + " (" + s.ms + "ms) " + s.detail.slice(0, 160)),
  });
  loopResults["coppersmith-plumbing-live"] = copper;
  check(
    "coppersmith live loop",
    "null",
    copper.report.error ? copper.report.error.code : "null",
    summarizeLoop("copper", copper),
  );
  console.log("   " + summarizeLoop("copper", copper));
  if (!copper.report.error) {
    check("coppersmith renderable", "true", String(copper.renderable), "");
    check("coppersmith has objects", ">0", copper.report.graphSummary.objects > 0 ? ">0" : "0", JSON.stringify(copper.report.graphSummary.schemas));
    check("coppersmith media ran", "ok", copper.report.media?.status ?? "null", copper.report.media?.reason ?? "");
  }

  // (b) Hostile URLs fail closed with typed codes (real network where safe).
  console.log("\n-- hostile URLs --");
  const hostile: Array<[string, string]> = [
    ["private IP literal", "http://10.0.0.5/"],
    ["loopback", "http://127.0.0.1:9/"],
    ["metadata endpoint", "http://169.254.169.254/"],
    ["bad scheme", "ftp://example.com/x"],
    ["credential URL", "https://user:pass@example.com/"],
    ["404 page", "https://www.coppersmithplumbing.com/this-page-does-not-exist-fyd-2026"],
    ["non-HTML (robots.txt as page)", "https://www.coppersmithplumbing.com/robots.txt"],
  ];
  const expectedCodes: Record<string, string> = {
    "private IP literal": "ACQ_PRIVATE_IP",
    loopback: "ACQ_PRIVATE_IP",
    "metadata endpoint": "ACQ_PRIVATE_IP",
    "bad scheme": "ACQ_SCHEME_REJECTED",
    "credential URL": "ACQ_CREDENTIAL_URL",
    "404 page": "ACQ_HTTP_STATUS",
    "non-HTML (robots.txt as page)": "ACQ_CONTENT_TYPE_REJECTED",
  };
  for (const [name, url] of hostile) {
    const r = await runLiveLoop({ url, runMedia: false });
    check("hostile: " + name, expectedCodes[name], r.report.error?.code ?? "null", r.report.error?.message ?? "");
  }

  // Timeout: direct gate proof with a 1ms budget against a real host.
  console.log("\n-- timeout (1ms budget, real host) --");
  const t = await safeFetchPage("https://www.coppersmithplumbing.com/", { timeoutMs: 1 });
  const tcode = t.ok ? "UNEXPECTED_OK" : classifyFetchFailure(t.reason);
  check("timeout fails closed", "ACQ_TIMEOUT", tcode, t.ok ? "ok" : t.reason);

  const failed = results.filter((r) => !r.pass);
  const evidencePath = "/tmp/fyd-live-proof-" + Date.now() + ".json";
  await writeFile(
    evidencePath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        cases: results,
        loops: Object.fromEntries(
          Object.entries(loopResults).map(([k, v]) => [k, { report: v.report, renderable: v.renderable }]),
        ),
      },
      null,
      2,
    ) + "\n",
  );
  console.log("\n=== " + (results.length - failed.length) + "/" + results.length + " checks passed ===");
  console.log("evidence: " + evidencePath);
  if (failed.length > 0) process.exit(1);
}

main().catch((e) => {
  console.error("proof script crashed:", e);
  process.exit(1);
});
