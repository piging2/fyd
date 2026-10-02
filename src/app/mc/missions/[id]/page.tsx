/**
 * Mission Control — mission detail.
 * MISSION → RUN → PROPOSAL → APPROVAL → EXECUTION → CANONICAL EVENT →
 * PROJECTION → EVIDENCE/HISTORY. Every section renders from the projected
 * mission record; stages with no supporting events render UNKNOWN honestly.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadJournalEvents, projectMissions, journalPath } from "../../../api/mc/_lib/mc-dispatch";

export const dynamic = "force-dynamic";

function Field({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div className="flex gap-2 text-sm">
      <dt className="w-44 shrink-0 font-mono text-xs uppercase text-slate-500 pt-0.5">{k}</dt>
      <dd className="font-mono text-xs break-all">{v ?? "—"}</dd>
    </div>
  );
}

function Stage({ title, events, emptyNote }: { title: string; events: Array<{ event_id: string; event_type: string; timestamp: string; summary: string | null }>; emptyNote: string }) {
  return (
    <section className="border rounded p-4 mb-4" aria-label={title}>
      <h3 className="text-sm font-semibold font-mono uppercase tracking-wide mb-2">{title}</h3>
      {events.length === 0 ? (
        <p className="text-xs font-mono text-amber-700">UNKNOWN — {emptyNote}</p>
      ) : (
        <ul className="space-y-1">
          {events.map((e) => (
            <li key={e.event_id} className="text-xs font-mono">
              <span className="text-slate-500">{e.timestamp}</span>{" "}
              <span className="font-semibold">{e.event_type}</span>{" "}
              <span className="text-slate-600">{e.event_id}</span>
              {e.summary ? <span className="text-slate-700"> — {e.summary}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function MissionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let journalError: string | null = null;
  let mission: ReturnType<typeof projectMissions>[number] | undefined;
  try {
    journalPath();
    mission = projectMissions(loadJournalEvents()).find((m) => m.mission_id === id);
  } catch (e) {
    journalError = e instanceof Error ? e.message : String(e);
  }
  if (journalError) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-10">
        <p className="text-sm font-mono text-red-700">Cannot project mission: {journalError}</p>
        <Link href="/mc" className="text-sm underline text-blue-800">← Mission Control</Link>
      </main>
    );
  }
  if (!mission) notFound();

  const evts = mission.events;
  const has = (re: RegExp) => evts.filter((e) => re.test(e.event_type));
  const proposalEvts = has(/PROPOSAL/);
  const approvalEvts = has(/APPROVAL/);
  const executionEvts = has(/EXECUTION|_RUN_|DISPATCH/);

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 font-sans">
      <Link href="/mc" className="text-sm underline text-blue-800">← Mission Control</Link>
      <header className="mt-4 mb-6">
        <p className="text-xs font-mono uppercase tracking-widest text-slate-500">mission</p>
        <h1 className="text-2xl font-bold font-mono break-all mt-1">{mission.mission_id}</h1>
        <p className="mt-2"><span className="inline-block px-2 py-0.5 text-xs font-mono border rounded bg-slate-100">{mission.status}</span></p>
      </header>

      <section className="border rounded p-4 mb-4" aria-label="mission record">
        <h3 className="text-sm font-semibold font-mono uppercase tracking-wide mb-2">Record</h3>
        <dl className="space-y-1">
          <Field k="run_id" v={mission.run_id} />
          <Field k="execution_id" v={mission.execution_id} />
          <Field k="tenant" v={mission.tenant} />
          <Field k="agent" v={mission.agent} />
          <Field k="capability" v={mission.capability} />
          <Field k="capabilities_granted" v={mission.capabilities_granted.join(", ") || null} />
          <Field k="work_order_id" v={mission.work_order_id} />
          <Field k="started_at" v={mission.started_at} />
          <Field k="ended_at" v={mission.ended_at} />
          <Field k="reconciliation_state" v={mission.reconciliation_state} />
          <Field k="outcome" v={mission.result.outcome} />
          <Field k="output_digest" v={mission.result.output_digest} />
          <Field k="error" v={mission.result.error} />
        </dl>
      </section>

      <Stage title="Proposal" events={proposalEvts} emptyNote="no proposal events recorded for this mission" />
      <Stage title="Approval" events={approvalEvts} emptyNote="no approval events recorded for this mission" />
      <Stage title="Execution" events={executionEvts} emptyNote="no execution events recorded for this mission" />
      <Stage title="Canonical events" events={evts} emptyNote="mission has no journal events" />

      <section className="border rounded p-4 mb-4" aria-label="evidence">
        <h3 className="text-sm font-semibold font-mono uppercase tracking-wide mb-2">Evidence</h3>
        {mission.evidence.length === 0 ? (
          <p className="text-xs font-mono text-amber-700">UNKNOWN — no evidence attached to this mission</p>
        ) : (
          <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-slate-50 p-2 rounded">
            {JSON.stringify(mission.evidence, null, 2)}
          </pre>
        )}
      </section>

      <section className="border rounded p-4 mb-4" aria-label="artifacts">
        <h3 className="text-sm font-semibold font-mono uppercase tracking-wide mb-2">Artifacts ({mission.artifacts.length})</h3>
        {mission.artifacts.length === 0 ? (
          <p className="text-xs font-mono text-slate-600">None recorded.</p>
        ) : (
          <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-slate-50 p-2 rounded">
            {JSON.stringify(mission.artifacts, null, 2)}
          </pre>
        )}
      </section>
    </main>
  );
}
