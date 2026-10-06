/**
 * regen-trigger.ts — approve/clear -> projection regeneration trigger.
 *
 * SERVER-ONLY. Imported only by the FYD customize API route handlers.
 *
 * Invariant: APPROVED CANONICAL CHANGE -> AFFECTED PROJECTION INVALIDATED
 * -> REBUILD/RECOMPUTE -> NEW VERSION SERVED.
 *
 * The journal write is the canonical truth; this module owns the derived
 * step that follows it. It runs the existing projection dump
 * (tools/fyd-site-projection/dump.py) for the affected site with the demo
 * journal selected, then verifies the journaled event id actually landed in
 * the new projection's meta.overlayEventIds version vector.
 *
 * Failure semantics (per the product requirement):
 * - Approval stays committed regardless of what happens here. A failed or
 *   slow regeneration never loses an approved transition.
 * - The result is reported honestly: { ok, verified }. The approval
 *   response surfaces regen status; it never claims the site changed
 *   before the projection verifies.
 * - The dump writes atomically (tmp + rename) and serve-time reads are
 *   uncached, so the page keeps serving the previous verified projection
 *   until the new file lands whole.
 * - Journal selection is fail-closed: FYD_OVERLAY_JOURNAL=demo is set
 *   explicitly. The default ("main") fails closed with WRONG_JOURNAL
 *   against the cutover-HOLD main gateway; this module never relies on
 *   the default.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

/**
 * Interval 08 whitelist (Nolan, binding): regeneration opens NARROWLY for
 * "ping-fyd" only - exactly the capability demonstrated in Interval 07
 * (owner corrects a fact, hides/shows a fact, publishes an address, changes
 * section priority -> approval -> journaled overlay -> projection rebuild ->
 * owner intent survives source re-observation). No tenant wildcard, no
 * broader mutation privilege: SOURCE X stays the pinned fixture base (never
 * rewritten), OWNER Y travels only through journaled overlays, and the
 * base/overlay digest verification still runs on every regen.
 *
 * Must match tools/fyd-site-projection/dump.py SITES.
 */
const KNOWN_SITES = new Set([
  "happy-place",
  "coppersmith-plumbing",
  "ping-fyd",
]);

const PROJECTION_DIR =
  process.env.FYD_PROJECTION_DIR ?? "/home/nolan/ping/var/fyd-projections";

const REGEN_TIMEOUT_MS = 30_000;

export interface RegenResult {
  ok: boolean;
  siteId: string;
  eventId: string;
  /** True when the journaled event id is present in the new projection's
   *  meta.overlayEventIds after the dump. */
  verified: boolean;
  latencyMs: number;
  error?: string;
}

function repoRoot(): string {
  return process.env.FYD_REPO_ROOT ?? process.cwd();
}

/**
 * Re-run the projection dump for one site and verify the event landed.
 * Never throws: all failures are returned as { ok: false, ... }.
 */
export async function regenerateSiteProjection(
  siteId: string,
  eventId: string,
): Promise<RegenResult> {
  const started = Date.now();
  const fail = (error: string): RegenResult => ({
    ok: false,
    siteId,
    eventId,
    verified: false,
    latencyMs: Date.now() - started,
    error,
  });

  if (!KNOWN_SITES.has(siteId)) {
    return fail(`unknown site for regeneration: ${siteId}`);
  }
  if (!eventId || typeof eventId !== "string") {
    return fail("eventId is required");
  }

  const dumpPy = join(repoRoot(), "tools", "fyd-site-projection", "dump.py");
  try {
    await execFileAsync("python3", [dumpPy, siteId], {
      env: { ...process.env, FYD_OVERLAY_JOURNAL: "demo" },
      timeout: REGEN_TIMEOUT_MS,
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(`dump failed: ${msg.slice(0, 300)}`);
  }

  try {
    const raw = await readFile(join(PROJECTION_DIR, `${siteId}.json`), "utf8");
    const doc = JSON.parse(raw) as {
      meta?: { overlayEventIds?: unknown };
    };
    const ids = doc?.meta?.overlayEventIds;
    const verified = Array.isArray(ids) && ids.includes(eventId);
    return {
      ok: true,
      siteId,
      eventId,
      verified,
      latencyMs: Date.now() - started,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return fail(`projection verification failed: ${msg.slice(0, 300)}`);
  }
}
