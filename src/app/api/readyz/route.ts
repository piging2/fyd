import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { buildCommitSha, deploymentReadiness } from "@/fyd/customize/server";

/**
 * Build identity seam: binds the served bytes to the source commit and the
 * build that produced them. buildId comes from the Next.js build output;
 * commitSha comes from the serve script (FYD_BUILD_SHA, exported by
 * start-3100.sh from `git rev-parse HEAD` at launch) or, on Vercel, from
 * the platform's VERCEL_GIT_COMMIT_SHA for the deployment; builtAt is the
 * build output mtime. Nulls mean the seam could not observe the value,
 * never a guess.
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
    commitSha: buildCommitSha(),
    builtAt,
  };
}

/**
 * GET /readyz — readiness, deployment-mode aware (see deploymentReadiness
 * in @/fyd/customize/server). Journal mode (the self-hosted demo
 * deployment): 200 when the journal write path can serve owner actions.
 * Snapshot mode (Vercel serverless, where no journal gateway exists):
 * 200 when the bundled overlay snapshot and the tenant manifest the
 * deployment serves from are loadable. 503 with the reason when the
 * applicable checks fail.
 */
export async function GET() {
  const probe = await deploymentReadiness();
  const build = await buildIdentity();
  if (probe.ready) {
    return NextResponse.json(
      {
        ok: true,
        ready: true,
        service: "fyd",
        mode: probe.mode,
        checks: probe.checks,
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
      reason: probe.reason ?? "not ready",
      mode: probe.mode,
      checks: probe.checks,
      at: new Date().toISOString(),
      build,
    },
    { status: 503 },
  );
}
