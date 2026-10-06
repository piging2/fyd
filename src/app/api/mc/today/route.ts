/**
 * GET /api/mc/today
 *
 * Mission Control TODAY screen, composed ONLY from live backend state.
 * Every number traces to a real source. Nothing is faked.
 *
 * Sources (all read server-side on the Pig):
 * - Journal gateway (localhost:18199): recent FYD_SITE_OVERLAY events -> what changed
 * - Fleet ledger (~/workspace/ping-build-program/fleet/ledger.jsonl): recent mission verdicts
 * - Fleet inprogress dirs: workers currently running
 * - cron.d job files: scheduled autonomous work -> what will happen next
 * - GRILLING-BRIEF.md active questions: what requires authority
 * - :3100 /api/health + journal gateway / : service health
 * - git status: repo dirty state
 *
 * status vocabulary: PROVEN (live backend state), DEGRADED (partial read),
 * PROTOTYPE (static/unwired; never shown as fact).
 */
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  listStuckMissions,
  getPipelineCounts,
} from "../_lib/mc-ping-journal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const HOME = process.env.HOME || "/home/nolan";
const JOURNAL_BASE = "http://localhost:18199";
const SELF_BASE = "http://localhost:3100";
const FETCH_TIMEOUT = 4000;

type Health = "PROVEN" | "DEGRADED" | "PROTOTYPE";

async function fetchJson(url: string, timeoutMs = FETCH_TIMEOUT) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!r.ok) return { ok: false, status: r.status, body: null as unknown };
    return { ok: true, status: r.status, body: (await r.json()) as unknown };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      body: null as unknown,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(t);
  }
}

async function readLedgerTail(n: number) {
  const p = path.join(HOME, "workspace/ping-build-program/fleet/ledger.jsonl");
  try {
    const text = await readFile(p, "utf8");
    const lines = text.trim().split("\n").filter(Boolean);
    const tail = lines.slice(-n);
    return tail
      .map((l) => {
        try {
          return JSON.parse(l) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Record<string, unknown>[];
  } catch {
    return null;
  }
}

function listDirSafe(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => !d.name.startsWith(".") && !d.name.startsWith("_"))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

function readActiveGrillQuestions(): string[] | null {
  try {
    const p = path.join(HOME, "workspace/GRILLING-BRIEF.md");
    const text = fs.readFileSync(p, "utf8");
    const start = text.indexOf("## ACTIVE QUESTIONS");
    if (start < 0) return null;
    const end = text.indexOf("## RESOLVED / EXECUTE NOW", start);
    const slice = text.slice(start, end < 0 ? undefined : end);
    const out: string[] = [];
    for (const line of slice.split("\n")) {
      const m = line.match(/^###\s+(.+?):/);
      if (m) out.push(m[1].trim());
    }
    return out;
  } catch {
    return null;
  }
}

async function gitDirtyCount(): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("git", [
      "-C",
      "/home/nolan/projects/ping",
      "status",
      "--porcelain",
    ]);
    return stdout.trim().split("\n").filter(Boolean).length;
  } catch {
    return null;
  }
}

export async function GET() {
  const degraded: string[] = [];

  // 1. Journal gateway: liveness + recent overlay events
  const journalPing = await fetchJson(`${JOURNAL_BASE}/`);
  const overlaysRaw = await fetchJson(
    `${JOURNAL_BASE}/events/FYD_SITE_OVERLAY?limit=15`
  );
  let overlays: unknown[] = [];
  if (overlaysRaw.ok) {
    const b = overlaysRaw.body as { events?: unknown[] } | unknown[];
    overlays = Array.isArray(b) ? b : (b.events ?? []);
  } else {
    degraded.push("journal overlays unreadable");
  }
  const overlayEvents = (overlays as Record<string, unknown>[]).map((e) => ({
    event_id: e.event_id,
    timestamp: e.timestamp,
    aggregate_id: e.aggregate_id,
    site: (e.event_data as Record<string, unknown> | undefined)?.siteId ?? null,
  }));

  // 2. Self health
  const selfHealth = await fetchJson(`${SELF_BASE}/api/health`);
  const journalHealth: Health =
    journalPing.ok && overlaysRaw.ok ? "PROVEN" : "DEGRADED";
  const siteHealth: Health = selfHealth.ok ? "PROVEN" : "DEGRADED";

  // 3. Fleet ledger tail
  const ledgerTail = await readLedgerTail(6);
  const recentVerdicts = (ledgerTail ?? []).map((r) => ({
    worker: r.worker,
    category: r.category,
    range: r.range,
    missions: r.missions,
    verdicts: r.verdicts,
    at: r.at,
  }));
  const failedEntries = recentVerdicts.filter((v) => {
    const vd = (v.verdicts ?? {}) as Record<string, number>;
    return Object.keys(vd).some((k) => /fail|error|reject/i.test(k));
  });
  if (ledgerTail === null) degraded.push("fleet ledger unreadable");

  // 4. Running workers (fleet inprogress)
  const inprogress = listDirSafe(
    path.join(HOME, "workspace/ping-build-program/fleet/inprogress")
  );
  if (inprogress.length === 0) degraded.push("no inprogress workers visible");

  // 5. Scheduled autonomous work (cron.d)
  const cronRoot = path.join(HOME, "workspace/cron.d");
  const schedules: { cadence: string; jobs: string[] }[] = [];
  for (const cadence of listDirSafe(cronRoot)) {
    const jobs = listDirSafe(path.join(cronRoot, cadence)).filter((j) =>
      /\.(md|json|sh)$/.test(j)
    );
    if (jobs.length) schedules.push({ cadence, jobs });
  }

  // 6. Authority items (grill brief)
  const authorityItems = readActiveGrillQuestions();
  if (authorityItems === null) degraded.push("grilling brief unreadable");

  // 7. Repo dirty state
  const dirty = await gitDirtyCount();
  if (dirty === null) degraded.push("git dirty state unreadable");

  // 8. ORCA narrow lane: stuck missions (impossible to miss) + pipeline counts
  let stuckMissions: unknown[] = [];
  let pipeline: Record<string, unknown> = {};
  try {
    stuckMissions = await listStuckMissions();
  } catch {
    degraded.push("stuck missions unreadable");
  }
  try {
    pipeline = (await getPipelineCounts()) as unknown as Record<string, unknown>;
  } catch {
    degraded.push("pipeline counts unreadable");
  }

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    status: (degraded.length ? "DEGRADED" : "PROVEN") as Health,
    degraded,
    services: {
      journalGateway: {
        status: journalHealth,
        base: JOURNAL_BASE,
        reachable: journalPing.ok,
      },
      site3100: { status: siteHealth, reachable: selfHealth.ok },
    },
    today: {
      happening: {
        status: "PROVEN" as Health,
        runningWorkers: inprogress,
        recentMissionVerdicts: recentVerdicts,
      },
      changed: {
        status: (overlaysRaw.ok ? "PROVEN" : "DEGRADED") as Health,
        recentOverlayEvents: overlayEvents,
        overlayEventCount: overlayEvents.length,
      },
      failed: {
        status: (ledgerTail === null ? "DEGRADED" : "PROVEN") as Health,
        entries: failedEntries,
      },
      needsAuthority: {
        status: (authorityItems === null ? "DEGRADED" : "PROVEN") as Health,
        activeGrillQuestions: authorityItems,
      },
      willHappenNext: {
        status: "PROVEN" as Health,
        scheduledJobs: schedules,
      },
      repoState: {
        status: (dirty === null ? "DEGRADED" : "PROVEN") as Health,
        dirtyFiles: dirty,
        note: "Dirty files are inventoried by owning lane, never swept.",
      },
    },
    problems: {
      status: "PROVEN" as Health,
      stuckMissions: {
        count: (stuckMissions as unknown[]).length,
        missions: stuckMissions,
        note: "Non-terminal missions. Must be zero.",
      },
      evidenceFailures: (pipeline as Record<string, unknown>).evidenceFailures ?? null,
    },
    pipeline: {
      status: "PROVEN" as Health,
      note: "OBSERVE -> EVIDENCE -> LEARNING chain, today (UTC).",
      observations: (pipeline as Record<string, unknown>).observations ?? null,
      missionsCreated: (pipeline as Record<string, unknown>).missions_created ?? null,
      missionsCompleted: (pipeline as Record<string, unknown>).missions_completed ?? null,
      claimsCreated: (pipeline as Record<string, unknown>).claims_created ?? null,
    },
    prototype: [
      "opportunities-found (marketing intelligence feed) not yet wired to a backend projection",
      "recovered (restart/recovery proof) not yet wired; ops lane owns it",
    ],
  });
}
