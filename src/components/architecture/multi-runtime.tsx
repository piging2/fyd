"use client";

import { cn } from "@/lib/utils";
import { MaturityLabel, type Maturity } from "@/components/maturity-label";

/**
 * One authority, many runtimes. Runtime cards describe the worker kinds that
 * exist in the PING repo. Convergence captured 2026-09-16/17: the same canonical
 * event was handled by the JS mission runtime and a Python executor, plus a scoped
 * Hermes WorkOrder, all under one authority with shared evidence. Not a fleet yet.
 */

const RUNTIMES: { id: string; label: string; status: Maturity; detail: string; color: string }[] = [
  { id: "js", label: "JS WORKERS", status: "Built", detail: "Deterministic task execution in the PING runtime. 150 executions in the captured commissioning run (2026-07-28).", color: "#2E5A4F" },
  { id: "py", label: "PYTHON WORKERS", status: "Built", detail: "A real Python capability (python.canonical_hash) executed a PING task against live Oracle Postgres: 44/44 assertions, zero Python-emitted events (captured 2026-09-16/17). Adapter code is uncommitted worktree code, not a live worker runtime.", color: "#7C5CD6" },
  { id: "agents", label: "EXTERIOR AGENTS", status: "Experimental", detail: "Codex, Hermes and similar workers are exterior agents, not PING subsystems. First scoped execution captured 2026-09-17: Hermes WorkOrder 0d598aef352b9a8a, exit 0, independently verified, three canonical PING events. One execution, not a fleet.", color: "#C9A227" },
];

const LOCATIONS: { id: string; label: string; status: Maturity; color: string }[] = [
  { id: "local", label: "LOCAL", status: "Built", color: "#2E5A4F" },
  { id: "oracle", label: "ORACLE", status: "Experimental", color: "#C9A227" },
  { id: "cloud", label: "CLOUD", status: "Direction", color: "#8B9BB4" },
];

export function MultiRuntime() {
  return (
    <div className="w-full" role="img" aria-label="Multi-runtime architecture: PING authority dispatches to JS workers, Python workers, and exterior agents, which return results and evidence. Execution can happen locally, on Oracle, or in the cloud under the same authority model.">
      <div className="text-center">
        <div className="mx-auto inline-block rounded-lg border-2 border-text bg-deep px-8 py-4">
          <p className="text-sm font-bold uppercase tracking-widest text-text-on-dark">Ping Authority</p>
          <p className="mt-1 text-xs text-text-on-dark/60">capabilities · identity · canonical state</p>
        </div>
      </div>

      <div className="mx-auto my-2 flex justify-center gap-16" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-8 w-px bg-border-soft" />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {RUNTIMES.map((rt) => (
          <div key={rt.id} className="rounded-lg border border-border-soft bg-surface p-5 text-center">
            <div className="mx-auto mb-3 h-2 w-16 rounded-full" style={{ backgroundColor: rt.color }} aria-hidden="true" />
            <p className="text-sm font-bold uppercase tracking-wide text-text">{rt.label}</p>
            <div className="mt-2"><MaturityLabel status={rt.status} /></div>
            <p className="mt-3 text-sm text-text-muted">{rt.detail}</p>
          </div>
        ))}
      </div>

      <div className="mx-auto my-2 flex justify-center gap-16" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-8 w-px bg-border-soft" />
        ))}
      </div>

      <div className="text-center">
        <div className="mx-auto inline-block rounded-lg border border-border-soft bg-surface px-6 py-3">
          <p className="text-sm font-bold uppercase tracking-wide text-text">Result / Evidence</p>
          <p className="mt-1 text-xs text-text-muted">returns to PING authority</p>
        </div>
      </div>

      <div className="mt-10">
        <h3 className="mb-4 text-center text-sm font-bold uppercase tracking-widest text-text-muted">Execution locations: same authority model</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {LOCATIONS.map((loc) => (
            <div key={loc.id} className="rounded-lg border border-border-soft bg-surface-2 p-5 text-center">
              <div className="mx-auto mb-2 h-1.5 w-12 rounded-full" style={{ backgroundColor: loc.color }} aria-hidden="true" />
              <p className="text-sm font-bold uppercase tracking-widest text-text">{loc.label}</p>
              <div className="mt-2"><MaturityLabel status={loc.status} /></div>
            </div>
          ))}
        </div>
        <div className="mx-auto mt-6 max-w-2xl text-center">
          <MaturityLabel status="Built" className="mb-3" />
          <p className="text-sm text-text-muted">
            The convergence itself, one canonical event handled by multiple runtimes under one authority,
            is captured (2026-09-16/17): the JS mission runtime plus a Python executor plus a scoped
            Hermes WorkOrder, with shared evidence lineage. Not a fleet yet.
            Status labels reflect evidence, not aspirations.
          </p>
        </div>
      </div>
    </div>
  );
}
