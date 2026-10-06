/**
 * Mission Control — proposal detail.
 * PROPOSAL → APPROVAL → CANONICAL EVENT. Read-only view of the recorded
 * proposal through the existing approvals route. The decision itself stays
 * behind the gated POST /api/mc/approvals with an authenticated caller.
 */
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

async function getProposal(id: string) {
  try {
    const h = await headers();
    const host = h.get("host") ?? "localhost:3100";
    const proto = h.get("x-forwarded-proto") ?? "http";
    const r = await fetch(
      `${proto}://${host}/api/mc/approvals?proposal_id=${encodeURIComponent(id)}`,
      { cache: "no-store" }
    );
    const j = (await r.json()) as { ok: boolean; proposal?: Record<string, unknown>; error?: string };
    if (!j.ok) return { ok: false as const, error: j.error ?? "unknown_proposal" };
    return { ok: true as const, proposal: j.proposal! };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : String(e) };
  }
}

function Row({ k, v }: { k: string; v: unknown }) {
  const text = v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v, null, 2) : String(v);
  return (
    <div className="flex gap-2 text-sm py-1 border-b last:border-0 border-slate-100">
      <dt className="w-44 shrink-0 font-mono text-xs uppercase text-slate-500 pt-0.5">{k}</dt>
      <dd className="font-mono text-xs break-all whitespace-pre-wrap">{text}</dd>
    </div>
  );
}

export default async function ProposalDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const res = await getProposal(id);
  if (!res.ok) {
    if (res.error === "unknown_proposal") notFound();
    return (
      <main className="max-w-4xl mx-auto px-6 py-10">
        <p className="text-sm font-mono text-red-700">Cannot read proposal: {res.error}</p>
        <Link href="/mc" className="text-sm underline text-blue-800">← Mission Control</Link>
      </main>
    );
  }
  const p = res.proposal;

  return (
    <main className="max-w-4xl mx-auto px-6 py-10 font-sans">
      <Link href="/mc" className="text-sm underline text-blue-800">← Mission Control</Link>
      <header className="mt-4 mb-6">
        <p className="text-xs font-mono uppercase tracking-widest text-slate-500">proposal</p>
        <h1 className="text-2xl font-bold font-mono break-all mt-1">{String(p.id ?? id)}</h1>
        <p className="mt-2">
          <span className="inline-block px-2 py-0.5 text-xs font-mono border rounded bg-slate-100">
            {String(p.status ?? "UNKNOWN")}
          </span>
        </p>
      </header>

      <section className="border rounded p-4 mb-4" aria-label="decision">
        <h3 className="text-sm font-semibold font-mono uppercase tracking-wide mb-2">Decision record</h3>
        <dl>
          <Row k="status" v={p.status} />
          <Row k="proposal_digest" v={p.proposal_digest} />
          <Row k="capability" v={p.capability} />
          <Row k="actor" v={p.actor} />
          <Row k="tenant" v={p.tenant} />
          <Row k="decided_at" v={p.decided_at} />
          <Row k="decided_by" v={p.decided_by} />
          <Row k="expires_at" v={p.expires_at} />
          <Row k="expiry_policy" v={p.expiry_policy} />
        </dl>
      </section>

      <section className="border rounded p-4 mb-4" aria-label="consequence">
        <h3 className="text-sm font-semibold font-mono uppercase tracking-wide mb-2">Consequence envelope</h3>
        <dl>
          <Row k="consequence" v={p.consequence} />
          <Row k="cost" v={p.cost} />
        </dl>
      </section>

      <section className="border rounded p-4 mb-4" aria-label="proposal body">
        <h3 className="text-sm font-semibold font-mono uppercase tracking-wide mb-2">Proposed change</h3>
        <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-slate-50 p-3 rounded">
          {JSON.stringify(p.proposal ?? null, null, 2)}
        </pre>
      </section>

      <p className="text-xs font-mono text-slate-500">
        Approval decisions are made through the gated POST /api/mc/approvals with an
        authenticated caller key — never from this page.
      </p>
    </main>
  );
}
