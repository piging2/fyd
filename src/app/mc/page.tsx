/**
 * Mission Control — operator surface over EXISTING authorities.
 * NOT a new authority. Missions project live from the canonical journal;
 * proposals read from the approval store through the existing approvals
 * route. No mocks, no fake counters: if the backend cannot answer, the UI
 * renders UNKNOWN.
 */
import Link from "next/link";
import { headers } from "next/headers";
import { loadJournalEvents, projectMissions, journalPath } from "../api/mc/_lib/mc-dispatch";

export const dynamic = "force-dynamic";

type Gw = { reachable: boolean; store?: string; journal?: string };

async function gatewayStatus(): Promise<Gw> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch("http://127.0.0.1:18199/", { signal: ctl.signal, cache: "no-store" });
    clearTimeout(t);
    if (!r.ok) return { reachable: false };
    const j = (await r.json()) as { store?: string; journal?: string };
    return { reachable: true, store: j.store, journal: j.journal };
  } catch {
    return { reachable: false };
  }
}

type ProposalRow = {
  proposal_id: string;
  status: string | null;
  tenant: string | null;
  capability: string | null;
  actor: string | null;
  proposal_digest: string | null;
  decided_at: string | null;
  decided_by: string | null;
};

async function proposalList(): Promise<{ ok: boolean; count: number; proposals: ProposalRow[]; error?: string }> {
  try {
    const h = await headers();
    const host = h.get("host") ?? "localhost:3100";
    const proto = h.get("x-forwarded-proto") ?? "http";
    const r = await fetch(`${proto}://${host}/api/mc/approvals`, { cache: "no-store" });
    const j = (await r.json()) as { ok: boolean; count?: number; proposals?: ProposalRow[]; error?: string };
    if (!j.ok) return { ok: false, count: 0, proposals: [], error: j.error ?? "list_failed" };
    return { ok: true, count: j.count ?? 0, proposals: j.proposals ?? [] };
  } catch (e) {
    return { ok: false, count: 0, proposals: [], error: e instanceof Error ? e.message : String(e) };
  }
}

function Badge({ s }: { s: string }) {
  const c =
    s === "SUCCEEDED" || s === "APPROVED" ? "bg-emerald-100 text-emerald-900 border-emerald-300"
    : s === "FAILED" || s === "DENIED" || s === "REFUSED" ? "bg-red-100 text-red-900 border-red-300"
    : s === "RUNNING" || s === "IN_PROGRESS" || s === "WAITING" ? "bg-amber-100 text-amber-900 border-amber-300"
    : "bg-slate-100 text-slate-700 border-slate-300";
  return <span className={`inline-block px-2 py-0.5 text-xs font-mono border rounded ${c}`}>{s}</span>;
}

export default async function MissionControlHome() {
  let journal: string | null = null;
  let journalError: string | null = null;
  let missions: ReturnType<typeof projectMissions> = [];
  let projectionError: string | null = null;
  try {
    journal = journalPath();
  } catch (e) {
    journalError = e instanceof Error ? e.message : String(e);
  }
  if (!journalError) {
    try {
      missions = projectMissions(loadJournalEvents());
    } catch (e) {
      projectionError = e instanceof Error ? e.message : String(e);
    }
  }
  const gw = await gatewayStatus();
  const props = await proposalList();
  const asOf = new Date().toISOString();

  return (
    <main className="max-w-6xl mx-auto px-6 py-10 font-sans">
      <header className="mb-8">
        <p className="text-xs font-mono uppercase tracking-widest text-slate-500">PING · operator surface</p>
        <h1 className="text-3xl font-bold mt-1">Mission Control</h1>
        <p className="text-sm text-slate-600 mt-2 max-w-2xl">
          Reads existing authorities (missions, runs, proposals, approvals, evidence, history).
          Creates none. Every number below is projected live — refresh preserves state
          because state lives in the journal and the approval store.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8" aria-label="chain status">
        <div className="border rounded p-4">
          <p className="text-xs font-mono uppercase text-slate-500">Canonical journal</p>
          {journal ? (
            <p className="text-xs font-mono mt-1 break-all">{journal}</p>
          ) : (
            <p className="text-xs font-mono mt-1 text-red-700">UNCONFIGURED — {journalError}</p>
          )}
        </div>
        <div className="border rounded p-4">
          <p className="text-xs font-mono uppercase text-slate-500">Journal gateway :18199</p>
          {gw.reachable ? (
            <>
              <p className="text-sm font-mono mt-1 text-emerald-700">REACHABLE</p>
              <p className="text-xs font-mono mt-1 break-all text-slate-600">{gw.journal}</p>
            </>
          ) : (
            <p className="text-sm font-mono mt-1 text-amber-700">UNKNOWN — unreachable</p>
          )}
        </div>
        <div className="border rounded p-4">
          <p className="text-xs font-mono uppercase text-slate-500">Projection</p>
          {projectionError ? (
            <p className="text-xs font-mono mt-1 text-red-700">FAILED — {projectionError}</p>
          ) : (
            <p className="text-sm font-mono mt-1">{missions.length} missions · {props.ok ? props.count : "?"} proposals</p>
          )}
          <p className="text-xs font-mono mt-1 text-slate-500">as of {asOf}</p>
        </div>
      </section>

      <section className="mb-10" aria-label="missions">
        <h2 className="text-xl font-semibold mb-3">Missions</h2>
        {projectionError || journalError ? (
          <p className="text-sm text-red-700 font-mono">Cannot project missions: {projectionError ?? journalError}</p>
        ) : missions.length === 0 ? (
          <p className="text-sm text-slate-600">
            No dispatch missions in the canonical journal. True state, not an empty mock —
            the proven approval chain below lives in the proposal records.
          </p>
        ) : (
          <div className="overflow-x-auto border rounded">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-mono uppercase text-slate-500 border-b">
                  <th className="px-3 py-2">Mission</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Tenant</th>
                  <th className="px-3 py-2">Agent</th>
                  <th className="px-3 py-2">Capability</th>
                  <th className="px-3 py-2">Run</th>
                  <th className="px-3 py-2">Started</th>
                  <th className="px-3 py-2">Events</th>
                </tr>
              </thead>
              <tbody>
                {missions.map((m) => (
                  <tr key={m.mission_id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link className="underline text-blue-800" href={`/mc/missions/${m.mission_id}`}>{m.mission_id}</Link>
                    </td>
                    <td className="px-3 py-2"><Badge s={m.status} /></td>
                    <td className="px-3 py-2 font-mono text-xs">{m.tenant ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{m.agent ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{m.capability ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{m.run_id ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{m.started_at ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{m.events.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-label="proposals">
        <h2 className="text-xl font-semibold mb-3">Proposals</h2>
        {!props.ok ? (
          <p className="text-sm text-red-700 font-mono">Cannot list proposals: {props.error}</p>
        ) : props.count === 0 ? (
          <p className="text-sm text-slate-600">No proposal records in the approval store.</p>
        ) : (
          <div className="overflow-x-auto border rounded">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-mono uppercase text-slate-500 border-b">
                  <th className="px-3 py-2">Proposal</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Capability</th>
                  <th className="px-3 py-2">Actor</th>
                  <th className="px-3 py-2">Digest</th>
                  <th className="px-3 py-2">Decided</th>
                  <th className="px-3 py-2">Decided by</th>
                </tr>
              </thead>
              <tbody>
                {props.proposals.map((p) => (
                  <tr key={p.proposal_id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link className="underline text-blue-800" href={`/mc/proposals/${p.proposal_id}`}>{p.proposal_id}</Link>
                    </td>
                    <td className="px-3 py-2"><Badge s={p.status ?? "UNKNOWN"} /></td>
                    <td className="px-3 py-2 font-mono text-xs">{p.capability ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.actor ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.proposal_digest ? p.proposal_digest.slice(0, 12) + "…" : "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.decided_at ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">{p.decided_by ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="mt-10 text-xs font-mono text-slate-500">
        <p>Authorities: canonical journal → deterministic projection; approval store → approvals route. No cache. No new store.</p>
      </footer>
    </main>
  );
}
