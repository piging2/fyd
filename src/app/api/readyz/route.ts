import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { journalReadiness } from "@/fyd/customize/server";

/**
 * Build identity seam: binds the served bytes to the source commit and the
 * build that produced them. buildId comes from the Next.js build output;
 * commitSha is exported by the serve script (start-3100.sh) from
 * `git rev-parse HEAD` at launch; builtAt is the build output mtime.
 * Nulls mean the seam could not observe the value, never a guess.
 */
async function buildIdentity() {
  const cwd = process.cwd();
  let buildId: string | null = null;
  let builtAt: string | null = null;
  try {
    buildId = (await readFile(join(cwd, ".next", "BUILD_ID"), "utf8")).trim() || null;
    builtAt = (await stat(join(cwd, ".next", "BUILD_ID"))).mtime.toISOString();
  } catch {
    /* not built or unreadable: leave nulls */
  }
  return {
    buildId,
    commitSha: process.env.FYD_BUILD_SHA ?? null,
    builtAt,
  };
}

/**
 * GET /readyz — readiness. Runs the journal preflight (gateway reachable
 * + live-derived identity marker matches). 200 when the write path can
 * serve owner actions, 503 with the reason when it cannot.
 */
export async function GET() {
  const probe = await journalReadiness();
  const build = await buildIdentity();
  if (probe.ready) {
    return NextResponse.json(
      {
        ok: true,
        ready: true,
        service: "fyd",
        at: new Date().toISOString(),
        build,
      },
      { status: 200 },
    );
  }
  return NextResponse.json(
    {
      ok: false,
      ready: false,
      service: "fyd",
      reason: probe.reason ?? "journal not ready",
      at: new Date().toISOString(),
      build,
    },
    { status: 503 },
  );
}
