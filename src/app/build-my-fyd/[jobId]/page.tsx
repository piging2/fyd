/**
 * [Build My FYD] job page (Track F, 2026-09-25).
 *
 * Renders a completed (or failed) intake build persisted by
 * POST /api/fyd/build to var/fyd-intake/<jobId>/result.json.
 *
 * DEMO MODE: this page runs with :3100 demo-owner mode ON (started via
 * /home/nolan/start-3100.sh, which exports NEXT_PUBLIC_FYD_DEMO_OWNER_MODE=1).
 * DEMO_OWNER_MODE is a demo-only tenant context flag: it does NOT change
 * evidence rules, rights scoping, or the object-builder schema catalog,
 * and it is never a production authentication mechanism. The generated
 * presence shown here is not published anywhere external.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notFound } from "next/navigation";
import { BuildClient } from "@/app/build/[siteId]/build-client";
import type { ObjectGraph, FYDSiteSpec, FYDFinding } from "@/fyd/sitespec/types";
import type { DisplayMedia } from "@/fyd/media/select";

export const dynamic = "force-dynamic";

interface JobPayload {
  report: {
    tenantId: string;
    seedUrl: string;
    finalUrl: string | null;
    stages: Array<{ stage: string; status: string; detail: string; ms: number }>;
    graphSummary: { objects: number; relationships: number; schemas: Record<string, number> };
    specSummary: {
      pages: number;
      sections: number;
      semanticDigest: string;
      renderable: boolean;
      errors: number;
      warnings: number;
      info: number;
    } | null;
    media: { status: string; reason: string; ingested: number; rejected: number } | null;
    socials: Array<{ url: string; status: string; detail: string }>;
    documents: Array<{ name: string; status: string; detail: string }>;
    error: { code: string; stage: string; message: string } | null;
  };
  graph: ObjectGraph;
  spec: FYDSiteSpec | null;
  findings: FYDFinding[];
  renderable: boolean;
  heroMedia: DisplayMedia | null;
  galleryMedia: DisplayMedia[];
}

async function loadJob(jobId: string): Promise<JobPayload | null> {
  try {
    const raw = await readFile(join(process.cwd(), "var", "fyd-intake", jobId, "result.json"), "utf8");
    return JSON.parse(raw) as JobPayload;
  } catch {
    return null;
  }
}

export default async function BuildMyFydJobPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  if (!/^live-[0-9a-f]{12}$/.test(jobId)) notFound();
  const job = await loadJob(jobId);
  if (!job) notFound();
  const { report } = job;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-semibold">DEMO PREVIEW</p>
        <p className="mt-1">
          Built live from {report.seedUrl}. Demo-only: no owner account, no production auth.
          Nothing here publishes externally.
        </p>
      </div>

      <h1 className="mt-8 text-3xl font-bold tracking-tight">Your FYD presence</h1>

      {report.error ? (
        <div role="alert" className="mt-6 rounded border border-red-300 bg-red-50 p-5">
          <p className="font-semibold text-red-900">Build failed: {report.error.code}</p>
          <p className="mt-2 text-sm text-red-800">
            Stage: {report.error.stage}. {report.error.message}
          </p>
          <p className="mt-2 text-sm text-red-700">
            FYD fails closed: it will not show you a presence built from unreachable,
            unreadable, or disallowed sources.
          </p>
        </div>
      ) : (
        <p className="mt-2 text-neutral-600">
          {report.graphSummary.objects} objects, {report.graphSummary.relationships} relationships,{" "}
          {report.specSummary?.pages ?? 0} pages. Semantic digest {report.specSummary?.semanticDigest.slice(0, 12)}.
        </p>
      )}

      <section className="mt-8 rounded border border-neutral-200 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">Build report</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {report.stages.map((s, i) => (
            <li key={i}>
              <span className="font-mono font-semibold">{s.stage.toUpperCase()}</span>{" "}
              <span
                className={
                  s.status === "ok" ? "text-green-700" : s.status === "skipped" ? "text-amber-700" : "text-red-700"
                }
              >
                {s.status}
              </span>
              <p className="text-neutral-600">{s.detail}</p>
            </li>
          ))}
        </ul>
        {report.media && (
          <p className="mt-3 text-sm text-neutral-600">
            Media: {report.media.status} ({report.media.ingested} ingested, {report.media.rejected}{" "}
            rights-rejected). {report.media.reason}
          </p>
        )}
        {report.socials.length > 0 && (
          <p className="mt-2 text-sm text-neutral-600">
            Socials:{" "}
            {report.socials.map((s) => s.status + " " + s.url).join(" / ")}
          </p>
        )}
      </section>

      {!report.error && job.spec && (
        <section className="mt-8">
          <BuildClient
            spec={job.spec}
            graph={job.graph}
            findings={job.findings}
            renderable={job.renderable}
            heroMedia={job.heroMedia}
            galleryMedia={job.galleryMedia}
          />
        </section>
      )}
    </main>
  );
}
