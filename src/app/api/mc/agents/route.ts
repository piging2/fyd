/**
 * GET /api/mc/agents
 *
 * The agent/mission view with per-operation fields per the 2026-09-24
 * Autonomous Port Law. Fields:
 *   Mission, Run, Operation, Attempt, Effect, Idempotency Key, Current State,
 *   Last Evidence, Reconciliation State, Retry Eligibility, Criticality,
 *   Authority Requirement.
 *
 * TRUTH DISPLAY LAW: the UI must NEVER display FAILED merely because a
 * worker timed out. Timeout entries surface as
 * "OUTCOME UNKNOWN — RECONCILIATION IN PROGRESS".
 *
 * CONTROL LAW: inspect-evidence is a read (real). Request-reconciliation,
 * hold, resume, cancel-future-work are NOT rendered until the ORCA port lane
 * exposes a witnessed mutation for them. "RETRY NOW" is never offered for
 * unknown consequential effects.
 *
 * Sources (observable machine state): fleet inprogress dirs, fleet ledger,
 * cron.d, OS process list. Idempotency Key / Reconciliation State /
 * Retry Eligibility are part of the ORCA port-lane contract and are exposed
 * as null with status PROTOTYPE until that lane wires them into the runtime.
 * We coordinate on that contract; we do not invent it.
 */
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "node:fs";
import * as path from "node:path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const execFileAsync = promisify(execFile);
const HOME = process.env.HOME || "/home/nolan";

type Health = "PROVEN" | "DEGRADED" | "PROTOTYPE";

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

interface LedgerRow {
  at?: string;
  verdicts?: Record<string, number>;
  category?: string;
  range?: string;
  note?: string;
}

async function ledgerLastRow(worker: string): Promise<LedgerRow | null> {
  try {
    const p = path.join(HOME, "workspace/ping-build-program/fleet/ledger.jsonl");
    const text = await readFile(p, "utf8");
    const lines = text.trim().split("\n").filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const r = JSON.parse(lines[i]) as Record<string, unknown>;
        if (r.worker === worker) {
          return {
            at: r.at as string | undefined,
            verdicts: r.verdicts as Record<string, number> | undefined,
            category: r.category as string | undefined,
            range: r.range as string | undefined,
            note: r.note as string | undefined,
          };
        }
      } catch {
        /* skip */
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Truth display: a ledger verdict counts as FAILED only when the failure
 * is proven (not a timeout with unknown outcome).
 */
function displayState(row: LedgerRow | null, inprogress: boolean): string {
  if (inprogress) return "RUNNING";
  if (!row) return "OUTCOME UNKNOWN — NO RECORD";
  const vd = row.verdicts ?? {};
  const keys = Object.keys(vd);
  const timeoutish = keys.some((k) => /timeout|timed.?out/i.test(k));
  const failed = keys.some((k) => /fail|error|reject/i.test(k));
  if (timeoutish && !keys.some((k) => /^(proven|verified|success)$/i.test(k))) {
    return "OUTCOME UNKNOWN — RECONCILIATION IN PROGRESS";
  }
  if (failed) return "FAILED (proven)";
  if (keys.some((k) => /proven/i.test(k))) return "RECORDED — EFFECT VERIFIED";
  return "OUTCOME UNKNOWN — RECONCILIATION IN PROGRESS";
}

async function liveProcesses() {
  try {
    const { stdout } = await execFileAsync("ps", ["-eo", "comm,args"]);
    const rows = stdout.split("\n").slice(1);
    const interesting = rows.filter(
      (r) => /(node|python3?|next-server|tsx)/.test(r) && !/ps -eo/.test(r)
    );
    const by: Record<string, number> = {};
    for (const r of interesting.slice(0, 60)) {
      const cmd = r.trim().split(/\s+/)[0];
      by[cmd] = (by[cmd] ?? 0) + 1;
    }
    return { observed: true as const, counts: by, sampled: interesting.length };
  } catch {
    return { observed: false as const, counts: {}, sampled: 0 };
  }
}

export async function GET() {
  const degraded: string[] = [];

  const cronRoot = path.join(HOME, "workspace/cron.d");
  const scheduled: { name: string; cadence: string; intervalHint: string | null }[] = [];
  for (const cadence of listDirSafe(cronRoot)) {
    for (const j of listDirSafe(path.join(cronRoot, cadence))) {
      const m = j.match(/^(.*?)__interval@(.+?)\.(md|json|sh)$/);
      scheduled.push({
        name: m ? m[1] : j,
        cadence,
        intervalHint: m ? m[2] : null,
      });
    }
  }
  if (!scheduled.length) degraded.push("no cron.d jobs visible");

  const inprogress = listDirSafe(
    path.join(HOME, "workspace/ping-build-program/fleet/inprogress")
  );

  // Per-operation view. Fields the ORCA port lane will wire are exposed as
  // null with PROTOTYPE status; nothing is invented.
  const operations: {
    mission: string;
    run: string[];
    operation: string | null;
    attempt: number | null;
    effect: unknown;
    idempotencyKey: string | null;
    currentState: string;
    lastEvidence: unknown;
    reconciliationState: string | null;
    retryEligibility: string;
    criticality: string | null;
    authorityRequirement: string | null;
    fieldStatus: Record<string, Health>;
  }[] = [];
  for (const w of inprogress) {
    const row = await ledgerLastRow(w);
    operations.push({
      mission: w,
      run: listDirSafe(
        path.join(HOME, "workspace/ping-build-program/fleet/inprogress", w)
      ).slice(0, 10),
      operation: row?.range ?? null,
      attempt: null,
      effect: row?.verdicts ?? null,
      idempotencyKey: null,
      currentState: displayState(row, true),
      lastEvidence: row
        ? { at: row.at, category: row.category, note: row.note }
        : null,
      reconciliationState: null,
      retryEligibility: "NOT EVALUATED — RETRY NOW is never offered for unknown consequential effects",
      criticality: null,
      authorityRequirement: null,
      fieldStatus: {
        mission: "PROVEN",
        run: "PROVEN",
        operation: row?.range ? "PROVEN" : "PROTOTYPE",
        attempt: "PROTOTYPE",
        effect: row?.verdicts ? "PROVEN" : "PROTOTYPE",
        idempotencyKey: "PROTOTYPE",
        currentState: "PROVEN",
        lastEvidence: row ? "PROVEN" : "PROTOTYPE",
        reconciliationState: "PROTOTYPE",
        retryEligibility: "PROVEN",
        criticality: "PROTOTYPE",
        authorityRequirement: "PROTOTYPE",
      },
    });
  }

  const procs = await liveProcesses();
  if (!procs.observed) degraded.push("process list unreadable");

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    status: (degraded.length ? "DEGRADED" : "PROVEN") as Health,
    degraded,
    scheduledAgents: scheduled,
    operations,
    processes: procs,
    controls: {
      availableNow: ["inspect (open worker state)", "open evidence (journal)", "open trace"],
      withheldUntilWitnessed: [
        "request reconciliation (ORCA port lane is wiring the reconciler; no mutation exists yet)",
        "hold (same)",
        "resume after reconciliation (same)",
        "cancel future work (same)",
        "RETRY NOW (never offered for unknown consequential effects unless backend proves retry safe)",
      ],
    },
    prototype: [
      "idempotencyKey, reconciliationState, retryEligibility, criticality, authorityRequirement: pending the ORCA port-lane reconciler contract; exposed as null, not invented",
    ],
  });
}
