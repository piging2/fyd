/**
 * POST /api/fyd/build/[jobId]/rendered
 *
 * First-render beacon for the hour-10 magic-moment metric
 * (URL -> FIRST TRUSTWORTHY USEFUL RENDER). The job page fires this once
 * on first mount; the route stamps report.timings.firstRenderAt on the
 * job's own result file when unset.
 *
 * This writes only the job's existing result.json under var/fyd-intake
 * (the existing intake store). No new store, no new authority, no new
 * registry. Best-effort: beacon failures return non-200 and never affect
 * the render.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> },
): Promise<NextResponse> {
  const { jobId } = await params;
  if (!/^live-[0-9a-f]{12}$/.test(jobId)) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  const file = join(process.cwd(), "var", "fyd-intake", jobId, "result.json");
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  const timings = (payload as { report?: { timings?: Record<string, string | null> } })
    ?.report?.timings;
  if (timings && !timings.firstRenderAt) {
    timings.firstRenderAt = new Date().toISOString();
    try {
      await writeFile(file, JSON.stringify(payload, null, 2) + "\n");
    } catch {
      return NextResponse.json({ ok: false }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}
