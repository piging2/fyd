/**
 * POST /api/fyd/build
 *
 * [Build My FYD] intake endpoint (Track F, 2026-09-25).
 * Accepts { url, socials?, documentNames? }, runs the live acquisition
 * loop server-side, and streams stage progress as Server-Sent Events.
 *
 * Event frames (JSON per line):
 *   { type: "stage", stage: { stage, status, detail, ms } }
 *   { type: "done", jobId, ok, report }  // ok=false when report.error is set
 * report.timings carries the hour-10 metric timestamps:
 * urlSubmittedAt / firstMeaningfulObjectAt / siteSpecReadyAt /
 * firstRenderAt (the last is stamped by the job page's render beacon).
 *   { type: "error", message }            // unexpected throw, not a typed failure
 *
 * The final result (report + graph + spec + media selections) is
 * persisted to var/fyd-intake/<jobId>/result.json so the job page can
 * render it. Media acquisition is rights-gated inside the loop to the
 * authorized demo tenants; the endpoint itself never bypasses that.
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runLiveLoop } from "@/fyd/acquisition/live-loop";
import { canonicalEntityUrl } from "@/fyd/proceduralize/proceduralizer";

export const runtime = "nodejs";
export const maxDuration = 180;

interface IntakeBody {
  url?: string;
  socials?: string[];
  documentNames?: string[];
}

export async function POST(req: Request): Promise<Response> {
  let body: IntakeBody;
  try {
    body = (await req.json()) as IntakeBody;
  } catch {
    return Response.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const url = (body.url ?? "").trim();
  if (!url) return Response.json({ error: "Website URL is required." }, { status: 400 });
  const socials = Array.isArray(body.socials) ? body.socials.map(String).slice(0, 10) : [];
  const documentNames = Array.isArray(body.documentNames) ? body.documentNames.map(String).slice(0, 10) : [];

  const tenantId = "live-" + createHash("sha256").update(canonicalEntityUrl(url)).digest("hex").slice(0, 12);
  // Hour-10 metric: URL_SUBMITTED_AT is the moment the intake POST is received.
  const urlSubmittedAt = new Date().toISOString();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown): void => {
        controller.enqueue(encoder.encode("data: " + JSON.stringify(obj) + "\n\n"));
      };
      try {
        const result = await runLiveLoop({
          url,
          tenantId,
          socials,
          documentNames,
          urlSubmittedAtIso: urlSubmittedAt,
          onProgress: (stage) => send({ type: "stage", stage }),
        });
        const payload = {
          report: result.report,
          graph: result.graph,
          spec: result.spec,
          findings: result.findings,
          renderable: result.renderable,
          heroMedia: result.heroMedia,
          galleryMedia: result.galleryMedia,
        };
        const dir = join(process.cwd(), "var", "fyd-intake", tenantId);
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, "result.json"), JSON.stringify(payload, null, 2) + "\n");
        send({ type: "done", jobId: tenantId, ok: !result.report.error, report: result.report });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" },
  });
}
