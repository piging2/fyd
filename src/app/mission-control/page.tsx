"use client";

import { useCallback, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import dynamic from "next/dynamic";
import { RefreshCw, Sun, Moon, Link2 } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { WorkspaceCommand } from "@/components/mission-control/workspace-command";
import { OperationalOverview } from "@/components/mission-control/operational-overview";
import "./workspace.css";

const EvidenceWorkspace = dynamic(() => import("@/components/mission-control/evidence-workspace").then(m => m.EvidenceWorkspace), {
  loading: () => <div role="status" className="mc-panel">Loading the evidence workspace…</div>,
});
const ObjectWorkspace = dynamic(() => import("@/components/mission-control/object-workspace").then(m => m.ObjectWorkspace), {
  loading: () => <div role="status" className="mc-panel">Loading the object workspace…</div>,
});

/**
 * Mission Control navigation shell (99-hour convergence, block 0-10).
 * PROJECTION over proven backend state, not an authority. No mock numbers,
 * no fake rows. Every card carries a provenance line answering the charter
 * questions: WHERE DID THIS COME FROM? WHO OWNS IT? HOW CERTAIN IS IT?
 * WHAT CAN I DO? WHAT REQUIRES APPROVAL? WHAT ACTUALLY HAPPENED?
 *
 * Real-data views: /api/mc/today, /api/mc/agents, /api/mc/graph,
 * /api/mc/object, /api/mc/search, /api/mc/trace-forward,
 * /api/mc/crm?view=companies|people|leads|opportunities, plus a read-only
 * GET /api/mc/approvals lookup (served :3100 tree; this staging app is not
 * served, so lookups may be unreachable here and say so honestly).
 * Sections without a live source render an honest UNKNOWN empty state.
 */

type Health = "PROVEN" | "DEGRADED" | "PROTOTYPE";

type Truth =
  | "OBSERVED"
  | "DERIVED"
  | "INFERRED"
  | "PROPOSED"
  | "APPROVED"
  | "EXECUTED"
  | "VERIFIED"
  | "FAILED"
  | "UNKNOWN";

const TRUTH_STYLE: Record<Truth, { background: string; color: string }> = {
  OBSERVED: { background: "#14283f", color: "#8ab8ff" },
  DERIVED: { background: "#123f38", color: "#7de8d8" },
  INFERRED: { background: "#2e2e4a", color: "#b9b9ff" },
  PROPOSED: { background: "#4a3410", color: "#ffcf7d" },
  APPROVED: { background: "#0f3a5a", color: "#7dd3fc" },
  EXECUTED: { background: "#3a1f5a", color: "#d0a8ff" },
  VERIFIED: { background: "#123f2a", color: "#7dffa8" },
  FAILED: { background: "#4f1414", color: "#ff8a8a" },
  UNKNOWN: { background: "#3a3a4a", color: "#b9b9d6" },
};

function TruthBadge({ t }: { t: Truth }) {
  const s = TRUTH_STYLE[t];
  return (
    <span
      style={{
        ...s,
        fontSize: 10,
        fontWeight: 800,
        padding: "2px 8px",
        borderRadius: 10,
        letterSpacing: 1,
      }}
    >
      {t}
    </span>
  );
}

function Badge({ h }: { h: Health }) {
  const style =
    h === "PROVEN"
      ? { background: "#123f2a", color: "#7dffa8" }
      : h === "DEGRADED"
        ? { background: "#4a3410", color: "#ffcf7d" }
        : { background: "#3a3a4a", color: "#b9b9d6" };
  return (
    <span
      style={{
        ...style,
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 10,
        letterSpacing: 1,
      }}
    >
      {h}
    </span>
  );
}

type Prov = {
  source: string;
  owner: string;
  truth: Truth;
  canDo: string;
  approval: string;
  happened: string;
};

function ProvLine({ p }: { p: Prov }) {
  return (
    <details className="mc-provenance">
      <summary>Source &amp; authority · {p.truth.toLowerCase()}</summary>
      <div>
        From: {p.source} | Owner: {p.owner} | <TruthBadge t={p.truth} />
      </div>
      <div>
        Can do: {p.canDo} | Needs approval: {p.approval}
      </div>
      <div>What happened: {p.happened}</div>
    </details>
  );
}

function Card({
  title,
  health,
  prov,
  children,
}: {
  title: string;
  health: Health;
  prov?: Prov;
  children: React.ReactNode;
}) {
  return (
    <section
      className="mc-card"
      style={{
        border: "1px solid #2c2c3a",
        borderRadius: 10,
        padding: 14,
        marginBottom: 12,
        background: "#14141c",
      }}
    >
      <div
        style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}
      >
        <h3 style={{ margin: 0, fontSize: 15 }}>{title}</h3>
        <Badge h={health} />
        {prov && <TruthBadge t={prov.truth} />}
      </div>
      {prov && <ProvLine p={prov} />}
      <div style={{ fontSize: 13, color: "#cfcfe0" }}>{children}</div>
    </section>
  );
}

function J({ v }: { v: unknown }) {
  const [copy, setCopy] = useState("Copy JSON");
  return (
    <details className="mc-raw"><summary>Inspect returned record</summary><pre>{JSON.stringify(v, null, 2) ?? "No value returned"}</pre>
      <button onClick={async () => { try { await navigator.clipboard.writeText(JSON.stringify(v, null, 2) ?? "null"); setCopy("Copied"); } catch { setCopy("Copy unavailable"); } }} aria-live="polite">{copy}</button>
    </details>
  );
}

function EmptyState({ lane, owner }: { lane: string; owner: string }) {
  return (
    <Card
      title={lane}
      health="PROTOTYPE"
      prov={{
        source: "no live source wired yet",
        owner,
        truth: "UNKNOWN",
        canDo: "nothing yet (this shell is a read-only projection)",
        approval: "wiring a source belongs to the lane that owns it",
        happened: "this shell has observed nothing for this section",
      }}
    >
      <p style={{ color: "#9a97b5", margin: 0 }}>
        No live source wired yet. This section stays UNKNOWN rather than
        showing placeholder numbers.
      </p>
    </Card>
  );
}

/* ============ CRM view helpers (block 10-20) ============ */

/**
 * CRM contract notes (GET /api/mc/crm?view=..., served :3100 tree, added by
 * the parallel CRM-harvest writer):
 * - envelope: { ok, view, items, unknown, reason }
 * - companies: one item per business (siteId, name, schema, location,
 *   services, provenanceKind, graphDigest), projected from FYD tenant graphs
 * - leads: one item per lead; each field is either a bare value or
 *   { value, truth }; evidence carries a journal event ref plus graph
 *   object refs
 * - people / opportunities: { items: [], unknown: true, reason } (honest
 *   UNKNOWN, never placeholder rows)
 * Decoders below accept every plausible encoding of that contract and stay
 * UNKNOWN (never invented) where the API supplies nothing.
 */
const TRUTH_LIST = Object.keys(TRUTH_STYLE) as Truth[];

function asTruth(x: unknown): Truth {
  return typeof x === "string" && (TRUTH_LIST as string[]).includes(x)
    ? (x as Truth)
    : "UNKNOWN";
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return "(not returned)";
  if (Array.isArray(v)) return v.length ? v.map((x) => fmtVal(x)).join(", ") : "(none)";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

type FieldView = { text: string; truth: Truth };

function fieldView(
  item: Record<string, unknown>,
  keys: string[],
  truths?: Record<string, unknown>
): FieldView {
  for (const k of keys) {
    const raw = item[k];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === "object" && !Array.isArray(raw)) {
      const r = raw as Record<string, unknown>;
      if (r.value === undefined && r.truth === undefined) continue;
      return {
        text:
          r.value === undefined || r.value === null ? "(not returned)" : fmtVal(r.value),
        truth: asTruth(r.truth ?? (truths ? truths[k] : undefined)),
      };
    }
    return {
      text: fmtVal(raw),
      truth: asTruth(truths ? truths[k] : undefined),
    };
  }
  return { text: "(not returned)", truth: "UNKNOWN" };
}

function evidenceRefs(raw: unknown): {
  journal: string;
  objects: string;
  truth: Truth;
} {
  const truth =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? asTruth((raw as Record<string, unknown>).truth)
      : "UNKNOWN";
  if (raw === null || raw === undefined)
    return { journal: "(not returned)", objects: "(not returned)", truth };
  if (typeof raw === "string") return { journal: raw, objects: "(not returned)", truth };
  if (Array.isArray(raw))
    return { journal: "(not returned)", objects: fmtVal(raw), truth };
  const r = raw as Record<string, unknown>;
  const journalRaw =
    r.journalEvent ?? r.journalEventRef ?? r.eventId ?? r.event ?? r.value;
  const objectsRaw =
    r.graphObjects ?? r.graphObjectRefs ?? r.objects ?? r.objectRefs ?? r.refs;
  return {
    journal:
      journalRaw === undefined || journalRaw === null
        ? "(not returned)"
        : fmtVal(journalRaw),
    objects:
      objectsRaw === undefined || objectsRaw === null
        ? "(not returned)"
        : fmtVal(objectsRaw),
    truth,
  };
}

function crmItems(data: Record<string, unknown>): Record<string, unknown>[] {
  const items = data.items;
  if (!Array.isArray(items)) return [];
  return items.filter((x) => x !== null && typeof x === "object") as Record<
    string,
    unknown
  >[];
}

function crmReason(data: Record<string, unknown>): string {
  return String(
    data.reason ??
      data.unknownReason ??
      "no person records are projected yet; this view stays UNKNOWN rather than showing placeholder rows"
  );
}

const NAV: {
  id: string;
  label: string;
  items: { id: string; label: string }[];
}[] = [
  { id: "home", label: "HOME", items: [{ id: "overview", label: "Overview" }] },
  {
    id: "fyd",
    label: "FYD",
    items: [
      { id: "sites", label: "Sites" },
      { id: "objects", label: "Objects" },
      { id: "sources", label: "Sources" },
      { id: "ask", label: "Ask FYD" },
      { id: "owner-changes", label: "Owner changes" },
      { id: "publish", label: "Publish" },
    ],
  },
  {
    id: "crm",
    label: "CRM",
    items: [
      { id: "people", label: "People" },
      { id: "companies", label: "Companies" },
      { id: "leads", label: "Leads" },
      { id: "opportunities", label: "Opportunities" },
      { id: "conversations", label: "Conversations" },
      { id: "activities", label: "Activities" },
    ],
  },
  {
    id: "missions",
    label: "MISSIONS",
    items: [
      { id: "missions", label: "Missions" },
      { id: "runs", label: "Runs" },
      { id: "agents", label: "Agents" },
      { id: "results", label: "Results" },
      { id: "failures", label: "Failures" },
    ],
  },
  {
    id: "knowledge",
    label: "KNOWLEDGE",
    items: [
      { id: "claims", label: "Claims" },
      { id: "evidence", label: "Evidence" },
      { id: "questions", label: "Questions" },
      { id: "learnings", label: "Learnings" },
      { id: "playbooks", label: "Playbooks" },
    ],
  },
  {
    id: "marketing",
    label: "MARKETING",
    items: [
      { id: "opportunities", label: "Opportunities" },
      { id: "thesis-packages", label: "Thesis packages" },
      { id: "content", label: "Content" },
      { id: "campaigns", label: "Campaigns" },
      { id: "distribution", label: "Distribution" },
      { id: "outcomes", label: "Outcomes" },
    ],
  },
  {
    id: "media",
    label: "MEDIA",
    items: [
      { id: "assets", label: "Assets" },
      { id: "video-projects", label: "Video projects" },
      { id: "generations", label: "Generations" },
      { id: "renders", label: "Renders" },
      { id: "publishing", label: "Publishing" },
    ],
  },
  {
    id: "approvals",
    label: "APPROVALS",
    items: [
      { id: "pending", label: "Pending" },
      { id: "approved", label: "Approved" },
      { id: "rejected", label: "Rejected" },
      { id: "effects", label: "Effects" },
    ],
  },
  {
    id: "system",
    label: "SYSTEM",
    items: [
      { id: "capabilities", label: "Capabilities" },
      { id: "integrations", label: "Integrations" },
      { id: "health", label: "Health" },
      { id: "event-history", label: "Event history" },
      { id: "replay", label: "Replay" },
    ],
  },
];

const OP_FIELDS = [
  "mission",
  "run",
  "operation",
  "attempt",
  "effect",
  "idempotencyKey",
  "currentState",
  "lastEvidence",
  "reconciliationState",
  "retryEligibility",
  "criticality",
  "authorityRequirement",
] as const;

export default function MissionControlPage() {
  const { theme, setTheme } = useTheme();
  const [section, setSection] = useState("home");
  const [item, setItem] = useState("overview");
  const [today, setToday] = useState<Record<string, unknown> | null>(null);
  const [agents, setAgents] = useState<Record<string, unknown> | null>(null);
  const [siteId, setSiteId] = useState("happy-place");
  const [graph, setGraph] = useState<Record<string, unknown> | null>(null);
  const [trace, setTrace] = useState<Record<string, unknown> | null>(null);
  const [forward, setForward] = useState<Record<string, unknown> | null>(null);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<Record<string, unknown> | null>(null);
  const [proposalId, setProposalId] = useState("");
  const [proposal, setProposal] = useState<Record<string, unknown> | null>(null);
  const [crmCompanies, setCrmCompanies] = useState<Record<string, unknown> | null>(null);
  const [crmPeople, setCrmPeople] = useState<Record<string, unknown> | null>(null);
  const [crmLeads, setCrmLeads] = useState<Record<string, unknown> | null>(null);
  const [crmOpps, setCrmOpps] = useState<Record<string, unknown> | null>(null);
  const [refreshing, setRefreshing] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [copyStatus, setCopyStatus] = useState("");

  useEffect(() => {
    function restore() {
      const params = new URLSearchParams(window.location.search);
      const nextSection = NAV.find(s => s.id === params.get("section"));
      const nextItem = nextSection?.items.find(i => i.id === params.get("view"));
      setSection(nextSection?.id ?? "home");
      setItem(nextItem?.id ?? nextSection?.items[0].id ?? "overview");
      const site = params.get("site");
      if (site && /^[a-z0-9-]{1,80}$/.test(site)) setSiteId(site);
    }
    restore(); window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  const navigate = useCallback((nextSection: string, nextItem: string) => {
    const update = () => {
      const url = new URL(window.location.href);
      url.searchParams.set("section", nextSection); url.searchParams.set("view", nextItem);
      for (const param of ["event", "stage", "q", "status", "trace", "inspect", "field", "relation", "perspective", "executor", "capability", "tenant", "from", "to"]) url.searchParams.delete(param);
      if (nextSection === "missions" && nextItem === "failures") url.searchParams.set("status", "FAILED_OR_DENIED");
      if (nextSection === "missions" && nextItem === "results") url.searchParams.set("status", "SUCCEEDED");
      window.history.pushState(window.history.state, "", url);
      flushSync(() => window.dispatchEvent(new PopStateEvent("popstate")));
    };
    const doc = document as Document & { startViewTransition?: (update: () => void) => unknown };
    if (doc.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) doc.startViewTransition(update);
    else update();
  }, []);

  useEffect(() => {
    const controller = new AbortController(); let running = false;
    const read = async (url: string, receive: (value: Record<string, unknown>) => void) => {
      try { const response = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
        const value = await response.json(); if (!controller.signal.aborted) receive(value);
      } catch (error) { if (!controller.signal.aborted) receive({ ok: false, status: "DEGRADED", error: error instanceof Error ? error.message : "Source unavailable" }); }
    };
    const refresh = async () => {
      if (running) return; running = true; setRefreshing(true);
      await Promise.all([read("/api/mc/today", setToday), read("/api/mc/agents", setAgents)]);
      running = false; if (!controller.signal.aborted) setRefreshing(false);
    };
    void refresh();
    for (const [view, setter] of [["companies", setCrmCompanies], ["people", setCrmPeople], ["leads", setCrmLeads], ["opportunities", setCrmOpps]] as const) void read(`/api/mc/crm?view=${view}`, setter);
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 30000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [refreshKey]);

  useEffect(() => {
    const controller = new AbortController(); setGraph(null); setTrace(null); setForward(null);
    fetch(`/api/mc/graph?siteId=${encodeURIComponent(siteId)}`, { cache: "no-store", signal: controller.signal })
      .then(r => r.json()).then(value => { if (!controller.signal.aborted) setGraph(value); })
      .catch(error => { if (!controller.signal.aborted) setGraph({ ok: false, error: error instanceof Error ? error.message : "Graph source unavailable" }); });
    return () => controller.abort();
  }, [siteId, refreshKey]);

  const ask = useCallback(() => {
    if (!q.trim()) return;
    fetch(`/api/mc/search?q=${encodeURIComponent(q)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setAnswer);
  }, [q]);

  const lookupProposal = useCallback(() => {
    if (!proposalId.trim()) return;
    fetch(`/api/mc/approvals?proposal_id=${encodeURIComponent(proposalId.trim())}`, {
      cache: "no-store",
    })
      .then((r) =>
        r.json().then((body) => ({ httpStatus: r.status, body: body as unknown }))
      )
      .then((res) => setProposal(res as Record<string, unknown>))
      .catch(() =>
        setProposal({ httpStatus: 0, body: { ok: false, error: "unreachable" } })
      );
  }, [proposalId]);

  const g = (k: string) => (graph?.[k] ?? null) as unknown;
  const t = (k: string) =>
    (today as { today?: Record<string, unknown> } | null)?.today?.[k];
  const operations = (agents as { operations?: unknown[] } | null)?.operations ?? [];

  const todayProv = (title: string, truth: Truth, happened: string): Prov => ({
    source: "/api/mc/today (journal gateway 18199, fleet ledger, fleet inprogress, cron.d, GRILLING-BRIEF.md, /api/health, git)",
    owner: "PIG machine state, projected by the MC lane",
    truth,
    canDo: "inspect only (read-only projection)",
    approval: "nothing here is an action",
    happened,
  });

  const view = `${section}/${item}`;
  const sectionLabel = NAV.find(s => s.id === section)?.label ?? "HOME";
  const viewLabel = NAV.find(s => s.id === section)?.items.find(i => i.id === item)?.label ?? "Overview";
  const commands = NAV.flatMap(s => s.items.map(i => ({ id: `${s.id}/${i.id}`, label: i.label, group: s.label, keywords: [s.id, i.id], run: () => navigate(s.id, i.id) })));
  const evidenceMode = view === "knowledge/evidence" ? "evidence" : view === "system/replay" ? "replay" : view === "system/event-history" ? "events" : section === "missions" && item !== "agents" ? "missions" : null;

  return (
    <div className="mc-workspace">
      <aside className="mc-sidebar" aria-label="Workspace navigation">
        <a href="/" className="mc-brand"><span className="mc-brand-mark">P</span><span>PING<small>Mission control</small></span></a>
        {NAV.map((s) => (
          <div key={s.id} className="mc-nav-group">
            <button
              onClick={() => navigate(s.id, s.items[0].id)}
              className="mc-nav-heading"
            >
              {s.label}
            </button>
            {s.items.length > 1 && (
              <div className="mc-nav-items">
                {s.items.map((it) => (
                  <button
                    key={it.id}
                    onClick={() => navigate(s.id, it.id)}
                    className="mc-nav-link"
                    aria-current={section === s.id && item === it.id ? "page" : undefined}
                  >
                    <span className="mc-nav-marker" aria-hidden="true" />
                    {it.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="mc-sidebar-foot">Read the evidence.<br />Authority stays with PING.</div>
      </aside>

      <div className="mc-body">
        <header className="mc-toolbar"><div><h1>{viewLabel}</h1><p>{sectionLabel} / Mission Control</p></div>
          <div className="mc-tools">
            <select className="mc-mobile-select" aria-label="Workspace view" value={view} onChange={e => { const [s, i] = e.target.value.split("/"); navigate(s, i); }}>{NAV.map(s => <optgroup key={s.id} label={s.label}>{s.items.map(i => <option key={i.id} value={`${s.id}/${i.id}`}>{i.label}</option>)}</optgroup>)}</select>
            <WorkspaceCommand commands={commands} />
            <button className={`mc-icon-button ${refreshing ? "mc-refreshing" : ""}`} aria-label="Refresh source snapshots" title="Refresh source snapshots" disabled={refreshing} onClick={() => setRefreshKey(k => k + 1)}><RefreshCw size={16} /></button>
            <button className="mc-icon-button" aria-label="Copy workspace link" title="Copy workspace link" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setCopyStatus("Link copied"); } catch { setCopyStatus("Copy unavailable"); } }}><Link2 size={16} /></button>
            <button className="mc-icon-button" aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"} title="Switch theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button>
            <span className="mc-screen-status" role="status">{copyStatus || (refreshing ? "Reading sources…" : "Sources checked every 30s")}</span>
          </div>
        </header>
        {view === "home/overview" && <OperationalOverview today={today} agents={agents} navigate={navigate} />}
        {evidenceMode && <EvidenceWorkspace key={`evidence-${view}`} mode={evidenceMode} refreshSignal={refreshKey} />}
        {(view === "fyd/objects" || view === "fyd/sources") && <><div className="mc-tenant-tabs" aria-label="FYD tenant selection">{["happy-place", "coppersmith-plumbing", "ping-fyd"].map(id => <button key={id} type="button" aria-pressed={siteId === id} onClick={() => { const url = new URL(window.location.href); url.searchParams.set("site", id); url.searchParams.delete("object"); window.history.pushState(window.history.state, "", url); setSiteId(id); }}>{id}</button>)}</div><ObjectWorkspace siteId={siteId} graph={graph} refreshSignal={refreshKey} /></>}
        <details className="mc-source-details" open={view === "home/overview" || evidenceMode || view === "fyd/objects" || view === "fyd/sources" ? undefined : true} key={view}>
          <summary>{view === "home/overview" || evidenceMode || view === "fyd/objects" || view === "fyd/sources" ? "Additional source records & existing controls" : "Workspace records"}</summary>
        {/* ============ HOME ============ */}
        {view === "home/overview" && (
          <>
            {!today && <p>Loading live state...</p>}
            {today && (
              <>
                <Card
                  title="Services"
                  health={(today.status as Health) ?? "DEGRADED"}
                  prov={todayProv("services", "OBSERVED", "service health checks were just polled")}
                >
                  <J
                    v={{
                      services: (today as Record<string, unknown>).services,
                      degraded: today.degraded,
                    }}
                  />
                </Card>
                <Card
                  title="Happening now"
                  health="PROVEN"
                  prov={todayProv("happening", "OBSERVED", "read from live machine state this pass")}
                >
                  <J v={t("happening")} />
                </Card>
                <Card
                  title="Changed"
                  health="PROVEN"
                  prov={todayProv("changed", "OBSERVED", "journal overlay events were read this pass")}
                >
                  <J v={t("changed")} />
                </Card>
                <Card
                  title="Failed (proven only)"
                  health="PROVEN"
                  prov={todayProv("failed", "FAILED", "failures proven by fleet ledger verdicts")}
                >
                  <J v={t("failed")} />
                </Card>
                <Card
                  title="Needs your authority"
                  health="PROVEN"
                  prov={todayProv(
                    "needsAuthority",
                    "PROPOSED",
                    "these are open questions awaiting an owner decision"
                  )}
                >
                  <J v={t("needsAuthority")} />
                </Card>
                <Card
                  title="Will happen next"
                  health="PROVEN"
                  prov={todayProv(
                    "willHappenNext",
                    "INFERRED",
                    "inferred from cron.d schedules, not yet executed"
                  )}
                >
                  <J v={t("willHappenNext")} />
                </Card>
                <Card
                  title="Repo state"
                  health="PROVEN"
                  prov={todayProv("repoState", "OBSERVED", "git state was read this pass")}
                >
                  <J v={t("repoState")} />
                </Card>
                <Card
                  title="Not yet wired"
                  health="PROTOTYPE"
                  prov={todayProv("prototype", "UNKNOWN", "nothing observed")}
                >
                  <J v={(today as Record<string, unknown>).prototype} />
                </Card>
              </>
            )}
          </>
        )}

        {/* ============ FYD ============ */}
        {view === "fyd/sites" && (
          <>
            <Card
              title="Live sites"
              health="PROVEN"
              prov={{
                source: "FYD factory registry (served :3100 tree)",
                owner: "FYD factory lane",
                truth: "OBSERVED",
                canDo: "open the site in a new tab",
                approval: "edits on the site need owner authority",
                happened: "two tenant sites are live on the private :3100 surface",
              }}
            >
              <ul>
                <li>
                  <a href="/sites/happy-place" style={{ color: "#8ab8ff" }}>
                    /sites/happy-place
                  </a>{" "}
                  (private Tailscale route, port 3100)
                </li>
                <li>
                  <a href="/sites/coppersmith-plumbing" style={{ color: "#8ab8ff" }}>
                    /sites/coppersmith-plumbing
                  </a>{" "}
                  (private Tailscale route, port 3100)
                </li>
              </ul>
              <p>
                Ask FYD runs on these pages through the digest-verified tenant
                graph plus journal overlays. Safe actions (propose edit, correct
                fact, hide fact) live on the object experience behind owner
                authority; Mission Control links there rather than duplicating
                the write path.
              </p>
            </Card>
            <EmptyState lane="Site detail view" owner="FYD factory lane" />
          </>
        )}

        {view === "fyd/objects" && (
          <>
            <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
              {(graph?.tenants as string[] | undefined)?.map((x) => (
                <button
                  key={x}
                  onClick={() => { const url = new URL(window.location.href); url.searchParams.set("site", x); window.history.pushState(window.history.state, "", url); setSiteId(x); }}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    border: "1px solid #3a3a4e",
                    background: siteId === x ? "#2b2140" : "#14141c",
                    color: "#eceaf6",
                    cursor: "pointer",
                  }}
                >
                  {x}
                </button>
              ))}
            </div>
            {!graph && <p>Loading graph...</p>}
            {graph?.ok === false && <p>Graph unavailable: {String(graph.error)}</p>}
            {graph?.ok === true && (
              <>
                <Card
                  title={`Graph: ${siteId}`}
                  health="PROVEN"
                  prov={{
                    source: "/api/mc/graph via getFydTenantGraph (authorized seam, digest-verified, same read path as Ask FYD)",
                    owner: "FYD tenant graph (PING)",
                    truth: "DERIVED",
                    canDo: "inspect objects, open reverse trace",
                    approval: "no writes from this view",
                    happened: "graph composed from pinned fixture base plus journal overlays",
                  }}
                >
                  <J
                    v={{
                      objectCount: g("objectCount"),
                      relationshipCount: g("relationshipCount"),
                      provenanceKinds: g("provenanceKinds"),
                      predicates: g("predicates"),
                      ownerCorrectedCount: g("ownerCorrectedCount"),
                      meta: g("meta"),
                    }}
                  />
                </Card>
                <Card
                  title="Objects (click for trace)"
                  health="PROVEN"
                  prov={{
                    source: "/api/mc/graph, same seam as above",
                    owner: "FYD tenant graph (PING)",
                    truth: "OBSERVED",
                    canDo: "open the reverse trace for any object",
                    approval: "no writes from this view",
                    happened: "objects read from the composed tenant graph",
                  }}
                >
                  <ul style={{ listStyle: "none", padding: 0 }}>
                    {((g("objects") as unknown[]) ?? []).map((o) => {
                      const oo = o as Record<string, unknown>;
                      return (
                        <li key={String(oo.id)} style={{ marginBottom: 6 }}>
                          <button
                            onClick={() => {
                              setForward(null);
                              fetch(
                                `/api/mc/object?siteId=${siteId}&id=${encodeURIComponent(String(oo.id))}`
                              )
                                .then((r) => r.json())
                                .then(setTrace);
                            }}
                            style={{
                              background: "#1c1c28",
                              border: "1px solid #3a3a4e",
                              color: "#eceaf6",
                              padding: "6px 10px",
                              borderRadius: 6,
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            {String(oo.title)} ({String(oo.schema)})
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
                {trace && (
                  <Card
                    title="Reverse trace: rendered value to object to claim to evidence to source"
                    health="PROVEN"
                    prov={{
                      source: "/api/mc/object (Sanity law trace from real backend state)",
                      owner: "FYD tenant graph plus PING journal",
                      truth: "DERIVED",
                      canDo: "inspect evidence, run forward trace on journal events",
                      approval: "no writes from this view",
                      happened: "chain assembled from object, claim, evidence, source",
                    }}
                  >
                    <J v={(trace ?? {}) as Record<string, unknown>} />
                    {Boolean(
                      (
                        ((trace as Record<string, unknown>).trace as
                          | Record<string, unknown>
                          | undefined)?.evidence as Record<string, unknown> | undefined
                      )?.journalEvidence
                    ) && (
                      <ForwardButtons
                        evidence={
                          ((trace as Record<string, unknown>).trace as Record<string, unknown>)
                            .evidence as Record<string, unknown>
                        }
                        setForward={setForward}
                      />
                    )}
                  </Card>
                )}
                {forward && (
                  <Card
                    title="Forward trace: source change to website"
                    health="PROVEN"
                    prov={{
                      source: "/api/mc/trace-forward (journal gateway 18199)",
                      owner: "PING journal",
                      truth: "DERIVED",
                      canDo: "inspect affected downstream objects",
                      approval: "no writes from this view",
                      happened: "forward effects of a journal event were traced",
                    }}
                  >
                    <J v={forward} />
                  </Card>
                )}
              </>
            )}
          </>
        )}

        {view === "fyd/sources" && (
          <>
            {!graph && <p>Loading graph...</p>}
            {graph?.ok === false && <p>Sources unavailable: {String(graph.error)}</p>}
            {graph?.ok === true && (
              <>
                <Card
                  title={`Provenance breakdown: ${siteId}`}
                  health="PROVEN"
                  prov={{
                    source: "/api/mc/graph (provenanceKinds, derived from object provenance)",
                    owner: "FYD tenant graph (PING)",
                    truth: "DERIVED",
                    canDo: "inspect per-object provenance below",
                    approval: "no writes from this view",
                    happened: "provenance kinds were counted from the live graph",
                  }}
                >
                  <J v={g("provenanceKinds")} />
                </Card>
                <Card
                  title="Object provenance"
                  health="PROVEN"
                  prov={{
                    source: "/api/mc/graph objects (provenanceKind per object)",
                    owner: "FYD tenant graph (PING)",
                    truth: "OBSERVED",
                    canDo: "open the reverse trace under Objects for full chain",
                    approval: "no writes from this view",
                    happened: "per-object provenance was read from the live graph",
                  }}
                >
                  <ul style={{ listStyle: "none", padding: 0, fontSize: 12 }}>
                    {((g("objects") as unknown[]) ?? []).map((o) => {
                      const oo = o as Record<string, unknown>;
                      return (
                        <li key={String(oo.id)} style={{ marginBottom: 6 }}>
                          <TruthBadge
                            t={
                              String(oo.provenanceKind) === "canonical-journal"
                                ? "VERIFIED"
                                : String(oo.provenanceKind) === "unknown"
                                  ? "UNKNOWN"
                                  : "DERIVED"
                            }
                          />{" "}
                          <span style={{ color: "#eceaf6" }}>{String(oo.title)}</span>{" "}
                          <span style={{ color: "#9a97b5" }}>
                            {String(oo.provenanceKind)} | {String(oo.schema)} | {String(oo.id)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              </>
            )}
          </>
        )}

        {view === "fyd/ask" && (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && ask()}
                placeholder="show me everything about coppersmith"
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid #3a3a4e",
                  background: "#14141c",
                  color: "#eceaf6",
                }}
              />
              <button
                onClick={ask}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: "none",
                  background: "#4a3568",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Ask
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {[
                "show me everything about coppersmith",
                "what changed today",
                "what is waiting for me",
                "which business facts conflict",
                "what is running",
                "health",
              ].map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setQ(c);
                    fetch(`/api/mc/search?q=${encodeURIComponent(c)}`)
                      .then((r) => r.json())
                      .then(setAnswer);
                  }}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 16,
                    border: "1px solid #3a3a4e",
                    background: "#14141c",
                    color: "#b9b9d6",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
            {answer && (
              <Card
                title={`Answer (${String((answer as Record<string, unknown>).intent ?? "unknown")})`}
                health="PROVEN"
                prov={{
                  source: "/api/mc/search (deterministic intent router over object graph, evidence, runtime state; no LLM)",
                  owner: "MC search router (PING object graph)",
                  truth: "DERIVED",
                  canDo: "ask another question from the supported vocabulary",
                  approval: "no writes from this view",
                  happened: "the question was routed to a deterministic intent and answered from live state",
                }}
              >
                <J v={answer} />
              </Card>
            )}
          </>
        )}

        {view === "fyd/owner-changes" && (
          <>
            {!graph && <p>Loading graph...</p>}
            {graph?.ok === false && <p>Owner changes unavailable: {String(graph.error)}</p>}
            {graph?.ok === true && (
              <Card
                title={`Owner changes: ${siteId}`}
                health="PROVEN"
                prov={{
                  source: "/api/mc/graph (ownerCorrectionCount per object)",
                  owner: "business owners (corrections) over FYD tenant graph (PING)",
                  truth: "OBSERVED",
                  canDo: "open the reverse trace under Objects to see SOURCE SAYS X vs OWNER SAYS Y",
                  approval: "corrections are applied on the served tree behind owner authority, never here",
                  happened: `${String(g("ownerCorrectedCount"))} objects carry owner corrections in this tenant`,
                }}
              >
                <p>
                  {String(g("ownerCorrectedCount"))} of {String(g("objectCount"))} objects have
                  owner corrections.
                </p>
                <ul style={{ listStyle: "none", padding: 0, fontSize: 12 }}>
                  {((g("objects") as unknown[]) ?? [])
                    .map((o) => o as Record<string, unknown>)
                    .filter((oo) => Number(oo.ownerCorrectionCount ?? 0) > 0)
                    .map((oo) => (
                      <li key={String(oo.id)} style={{ marginBottom: 6 }}>
                        <TruthBadge t="APPROVED" /> {String(oo.title)}{" "}
                        <span style={{ color: "#9a97b5" }}>
                          ({String(oo.ownerCorrectionCount)} correction
                          {Number(oo.ownerCorrectionCount) === 1 ? "" : "s"}) | {String(oo.id)}
                        </span>
                      </li>
                    ))}
                </ul>
              </Card>
            )}
          </>
        )}

        {view === "fyd/publish" && (
          <EmptyState lane="Publish" owner="FYD factory lane (owner authority)" />
        )}

        {/* ============ CRM ============ */}
        {view === "crm/companies" && (
          <>
            {!crmCompanies && <p>Loading companies...</p>}
            {crmCompanies && crmCompanies.ok === false && (
              <CrmFetchError title="Companies" data={crmCompanies} />
            )}
            {crmCompanies && crmCompanies.ok !== false && (
              <>
                <Card
                  title="Companies"
                  health="PROVEN"
                  prov={{
                    source:
                      "GET /api/mc/crm?view=companies (read-only projection of the FYD tenant graphs)",
                    owner: "FYD tenant graph (PING), projected by the CRM harvest lane",
                    truth: "DERIVED",
                    canDo: "inspect each business record below",
                    approval: "no writes from this view",
                    happened: `${crmItems(crmCompanies).length} businesses were projected from the FYD tenant graphs`,
                  }}
                >
                  <p>
                    {crmItems(crmCompanies).length} businesses projected from the
                    FYD tenant graphs. One card per business below.
                  </p>
                </Card>
                {crmItems(crmCompanies).map((c, i) => (
                  <CompanyCard key={String(c.siteId ?? c.name ?? i)} c={c} />
                ))}
                {crmItems(crmCompanies).length === 0 && (
                  <p style={{ color: "#9a97b5" }}>
                    The projection returned zero companies. Nothing is invented
                    in their place.
                  </p>
                )}
              </>
            )}
          </>
        )}

        {view === "crm/people" && (
          <>
            {!crmPeople && <p>Loading people...</p>}
            {crmPeople && crmPeople.ok === false && (
              <CrmFetchError title="People" data={crmPeople} />
            )}
            {crmPeople && crmPeople.ok !== false && (
              <Card
                title="People"
                health="PROTOTYPE"
                prov={{
                  source:
                    "GET /api/mc/crm?view=people (the API reports this view honestly UNKNOWN)",
                  owner: "PING object graph (block 10-20 CRM harvest lane)",
                  truth: "UNKNOWN",
                  canDo: "nothing yet (this shell is a read-only projection)",
                  approval: "wiring person records belongs to the CRM harvest lane",
                  happened: crmReason(crmPeople),
                }}
              >
                <p style={{ color: "#9a97b5", margin: 0 }}>{crmReason(crmPeople)}</p>
              </Card>
            )}
          </>
        )}

        {view === "crm/leads" && (
          <>
            {!crmLeads && <p>Loading leads...</p>}
            {crmLeads && crmLeads.ok === false && (
              <CrmFetchError title="Leads" data={crmLeads} />
            )}
            {crmLeads && crmLeads.ok !== false && (
              <>
                <Card
                  title="Leads"
                  health="PROVEN"
                  prov={{
                    source:
                      "GET /api/mc/crm?view=leads (journal visitor-intent events projected onto the FYD tenant graphs)",
                    owner: "PING journal plus FYD tenant graph, projected by the CRM harvest lane",
                    truth: "DERIVED",
                    canDo: "inspect each lead card and its evidence refs",
                    approval:
                      "contacting a lead needs owner authority; NEW leads show owner review with contact withheld",
                    happened: `${crmItems(crmLeads).length} leads were projected from visitor-intent events`,
                  }}
                >
                  <p>
                    {crmItems(crmLeads).length} leads projected. Every field
                    carries its own truth badge. NEW leads are owner review
                    only: contact is withheld until owner approval.
                  </p>
                </Card>
                {crmItems(crmLeads).map((lead, i) => (
                  <LeadCard key={String(lead.id ?? i)} lead={lead} index={i} />
                ))}
                {crmItems(crmLeads).length === 0 && (
                  <p style={{ color: "#9a97b5" }}>
                    The projection returned zero leads. Nothing is invented in
                    their place.
                  </p>
                )}
              </>
            )}
          </>
        )}

        {view === "crm/opportunities" && (
          <>
            {!crmOpps && <p>Loading opportunities...</p>}
            {crmOpps && crmOpps.ok === false && (
              <CrmFetchError title="Opportunities" data={crmOpps} />
            )}
            {crmOpps && crmOpps.ok !== false && (
              <Card
                title="Opportunities"
                health="PROTOTYPE"
                prov={{
                  source:
                    "GET /api/mc/crm?view=opportunities (the API reports this view honestly UNKNOWN)",
                  owner: "PING object graph (block 10-20 CRM harvest lane)",
                  truth: "UNKNOWN",
                  canDo: "nothing yet (this shell is a read-only projection)",
                  approval: "wiring opportunity records belongs to the CRM harvest lane",
                  happened: crmReason(crmOpps),
                }}
              >
                <p style={{ color: "#9a97b5", margin: 0 }}>{crmReason(crmOpps)}</p>
              </Card>
            )}
          </>
        )}

        {view === "crm/conversations" && (
          <EmptyState
            lane="Conversations"
            owner="PING object graph (block 10-20 CRM harvest lane; no conversation projection wired)"
          />
        )}
        {view === "crm/activities" && (
          <EmptyState
            lane="Activities"
            owner="PING object graph (block 10-20 CRM harvest lane; no activity projection wired)"
          />
        )}

        {/* ============ MISSIONS ============ */}
        {view === "missions/missions" && (
          <>
            <Card
              title="Control law"
              health="PROVEN"
              prov={{
                source: "/api/mc/agents (fleet inprogress dirs, fleet ledger, cron.d, OS process list)",
                owner: "MC lane (projection only)",
                truth: "OBSERVED",
                canDo: "inspect, open evidence, open trace (real reads)",
                approval:
                  "request reconciliation, hold, resume, cancel, RETRY NOW are withheld until the ORCA port lane wires a witnessed mutation",
                happened: "operations were observed from machine state this pass",
              }}
            >
              <p>
                Inspect, open evidence, and open trace are real reads. Request
                reconciliation, hold, resume after reconciliation, and cancel
                future work are withheld until the ORCA port lane wires a
                witnessed mutation for them. RETRY NOW is never offered for
                unknown consequential effects. UI CLAIM is less than or equal
                to BACKEND PROOF.
              </p>
            </Card>
            {!agents && <p>Loading observed agents...</p>}
            {agents && (
              <Card
                title="Missions (per-operation fields)"
                health="PROVEN"
                prov={{
                  source: "/api/mc/agents operations (Mission, Run, Operation, Attempt, Effect, Idempotency Key, Current State, Last Evidence, Reconciliation State, Retry Eligibility, Criticality, Authority Requirement)",
                  owner: "fleet ledger plus inprogress dirs (ORCA port lane contract for null fields)",
                  truth: "OBSERVED",
                  canDo: "inspect each operation's fields and per-field status",
                  approval: "no mutations offered from this view",
                  happened: `${operations.length} operations were observed this pass`,
                }}
              >
                {operations.length === 0 && <p>No live operations observed.</p>}
                {operations.map((op) => {
                  const o = op as Record<string, unknown>;
                  const fs = (o.fieldStatus ?? {}) as Record<string, Health>;
                  return (
                    <div
                      key={String(o.mission)}
                      style={{
                        border: "1px solid #2c2c3a",
                        borderRadius: 8,
                        padding: 10,
                        marginBottom: 10,
                        background: "#0e0e16",
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "180px 1fr",
                          gap: 4,
                          fontSize: 12,
                        }}
                      >
                        {OP_FIELDS.map((f) => (
                          <div key={f} style={{ display: "contents" }}>
                            <div style={{ color: "#9a97b5", fontWeight: 600 }}>
                              {f} <Badge h={fs[f] ?? "PROTOTYPE"} />
                            </div>
                            <div style={{ wordBreak: "break-word" }}>
                              {o[f] === null || o[f] === undefined ? (
                                <span style={{ color: "#6a6785" }}>
                                  pending ORCA port contract
                                </span>
                              ) : (
                                String(JSON.stringify(o[f]))
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </Card>
            )}
          </>
        )}

        {view === "missions/runs" && (
          <>
            {!agents && <p>Loading observed agents...</p>}
            {agents && (
              <Card
                title="Runs"
                health="PROVEN"
                prov={{
                  source: "/api/mc/agents operations (mission / run / attempt / currentState)",
                  owner: "fleet ledger plus inprogress dirs",
                  truth: "OBSERVED",
                  canDo: "inspect run identity and current state",
                  approval: "no mutations offered from this view",
                  happened: "runs were read from observed operations this pass",
                }}
              >
                {operations.length === 0 && <p>No live runs observed.</p>}
                <ul style={{ listStyle: "none", padding: 0, fontSize: 12 }}>
                  {operations.map((op) => {
                    const o = op as Record<string, unknown>;
                    return (
                      <li key={String(o.mission)} style={{ marginBottom: 6 }}>
                        <TruthBadge t={o.currentState ? "EXECUTED" : "UNKNOWN"} />{" "}
                        <span style={{ color: "#eceaf6" }}>{String(o.mission)}</span>{" "}
                        <span style={{ color: "#9a97b5" }}>
                          run {String(o.run ?? "?")} attempt {String(o.attempt ?? "?")} |{" "}
                          {o.currentState ? String(o.currentState) : "current state unknown"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </>
        )}

        {view === "missions/agents" && (
          <>
            {!agents && <p>Loading observed agents...</p>}
            {agents && (
              <>
                <Card
                  title="Scheduled agents (cron.d)"
                  health="PROVEN"
                  prov={{
                    source: "/api/mc/agents scheduledAgents (cron.d job files)",
                    owner: "Pig cron.d (autonomous work schedules)",
                    truth: "OBSERVED",
                    canDo: "inspect scheduled work",
                    approval: "schedule changes are not offered here",
                    happened: "cron.d schedules were read this pass",
                  }}
                >
                  <J v={(agents as Record<string, unknown>).scheduledAgents} />
                </Card>
                <Card
                  title="Live processes"
                  health="PROVEN"
                  prov={{
                    source: "/api/mc/agents processes (OS process list)",
                    owner: "Pig OS",
                    truth: "OBSERVED",
                    canDo: "inspect live processes",
                    approval: "no process control offered here",
                    happened: "the process list was read this pass",
                  }}
                >
                  <J v={(agents as Record<string, unknown>).processes} />
                </Card>
                <Card
                  title="Withheld controls"
                  health="PROVEN"
                  prov={{
                    source: "/api/mc/agents controls",
                    owner: "MC lane control law",
                    truth: "VERIFIED",
                    canDo: "inspect, open evidence, open trace",
                    approval: "everything else waits for a witnessed mutation",
                    happened: "no mutation control is exposed by this projection",
                  }}
                >
                  <J v={(agents as Record<string, unknown>).controls} />
                </Card>
                <Card
                  title="Not yet wired"
                  health="PROTOTYPE"
                  prov={todayProv("agents-prototype", "UNKNOWN", "nothing observed")}
                >
                  <J v={(agents as Record<string, unknown>).prototype} />
                </Card>
              </>
            )}
          </>
        )}

        {view === "missions/results" && (
          <>
            {!agents && <p>Loading observed agents...</p>}
            {agents && (
              <Card
                title="Results (ledger verdicts per mission)"
                health="PROVEN"
                prov={{
                  source: "/api/mc/agents operations effect (fleet ledger last row verdicts)",
                  owner: "fleet ledger (mission verdicts)",
                  truth: "OBSERVED",
                  canDo: "inspect per-mission verdict counts",
                  approval: "no mutations offered from this view",
                  happened: "verdicts were read from the fleet ledger this pass",
                }}
              >
                {operations.length === 0 && <p>No live operations observed.</p>}
                <ul style={{ listStyle: "none", padding: 0, fontSize: 12 }}>
                  {operations.map((op) => {
                    const o = op as Record<string, unknown>;
                    const eff = o.effect as Record<string, number> | null;
                    return (
                      <li key={String(o.mission)} style={{ marginBottom: 6 }}>
                        <TruthBadge t={eff ? "EXECUTED" : "UNKNOWN"} />{" "}
                        <span style={{ color: "#eceaf6" }}>{String(o.mission)}</span>{" "}
                        <span style={{ color: "#9a97b5" }}>
                          {eff ? JSON.stringify(eff) : "no ledger verdicts yet"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </>
        )}

        {view === "missions/failures" && (
          <>
            {!agents && <p>Loading observed agents...</p>}
            {agents && (
              <Card
                title="Failures (proven only)"
                health="PROVEN"
                prov={{
                  source: "/api/mc/agents operations effect (fleet ledger FAILED verdicts; timeout never displays as FAILED)",
                  owner: "fleet ledger (mission verdicts)",
                  truth: "FAILED",
                  canDo: "inspect which missions have proven failures",
                  approval: "RETRY NOW is never offered for unknown consequential effects",
                  happened: "proven failures were filtered from ledger verdicts this pass",
                }}
              >
                {operations.filter((op) => {
                  const eff = (op as Record<string, unknown>).effect as Record<
                    string,
                    number
                  > | null;
                  return eff && Number(eff.FAILED ?? 0) > 0;
                }).length === 0 && (
                  <p style={{ color: "#9a97b5" }}>
                    No proven failures among observed operations. A timeout
                    would surface as OUTCOME UNKNOWN, never as FAILED.
                  </p>
                )}
                <ul style={{ listStyle: "none", padding: 0, fontSize: 12 }}>
                  {operations
                    .filter((op) => {
                      const eff = (op as Record<string, unknown>).effect as Record<
                        string,
                        number
                      > | null;
                      return eff && Number(eff.FAILED ?? 0) > 0;
                    })
                    .map((op) => {
                      const o = op as Record<string, unknown>;
                      const eff = o.effect as Record<string, number>;
                      return (
                        <li key={String(o.mission)} style={{ marginBottom: 6 }}>
                          <TruthBadge t="FAILED" />{" "}
                          <span style={{ color: "#eceaf6" }}>{String(o.mission)}</span>{" "}
                          <span style={{ color: "#9a97b5" }}>{JSON.stringify(eff)}</span>
                        </li>
                      );
                    })}
                </ul>
              </Card>
            )}
          </>
        )}

        {/* ============ KNOWLEDGE ============ */}
        {view === "knowledge/claims" && (
          <EmptyState
            lane="Claims"
            owner="PING knowledge (block 30-40 knowledge retrieval lane)"
          />
        )}
        {view === "knowledge/evidence" && (
          <>
            <EmptyState
              lane="Evidence"
              owner="PING evidence (block 30-40 knowledge retrieval lane)"
            />
            <Card
              title="Existing evidence paths"
              health="PROVEN"
              prov={{
                source: "this shell already projects evidence traces under FYD / Objects",
                owner: "FYD tenant graph plus PING journal",
                truth: "DERIVED",
                canDo: "open FYD / Objects and click any object for its reverse trace",
                approval: "no writes from this view",
                happened: "no dedicated knowledge-evidence index is wired yet",
              }}
            >
              <p>
                Evidence chains exist today as per-object reverse traces
                (rendered value to object to claim to evidence to source) under
                FYD / Objects. A unified Claims to Evidence index is not wired
                yet and is not faked here.
              </p>
            </Card>
          </>
        )}
        {view === "knowledge/questions" && (
          <>
            {!today && <p>Loading live state...</p>}
            {today && (
              <Card
                title="Open questions"
                health="PROVEN"
                prov={{
                  source: "/api/mc/today needsAuthority (GRILLING-BRIEF.md active questions)",
                  owner: "MC lane (owner questions awaiting decisions)",
                  truth: "PROPOSED",
                  canDo: "inspect the open questions",
                  approval: "answering them is the approval itself",
                  happened: "open questions were read this pass",
                }}
              >
                <J v={t("needsAuthority")} />
              </Card>
            )}
          </>
        )}
        {view === "knowledge/learnings" && (
          <EmptyState
            lane="Learnings"
            owner="PING knowledge (block 30-40 knowledge retrieval lane)"
          />
        )}
        {view === "knowledge/playbooks" && (
          <EmptyState
            lane="Playbooks"
            owner="PING knowledge (block 30-40 knowledge retrieval lane)"
          />
        )}

        {/* ============ MARKETING ============ */}
        {section === "marketing" && (
          <EmptyState lane={`Marketing: ${item}`} owner="MarketingOS lane" />
        )}

        {/* ============ MEDIA ============ */}
        {section === "media" && (
          <EmptyState lane={`Media: ${item}`} owner="media pipeline lane" />
        )}

        {/* ============ APPROVALS ============ */}
        {section === "approvals" && (
          <>
            <Card
              title="Proposal lookup (read-only)"
              health="PROTOTYPE"
              prov={{
                source:
                  "GET /api/mc/approvals?proposal_id=<id> (exists on the served :3100 tree; this staging app is NOT served)",
                owner: "MC approval store via approval_request.py canonical transition",
                truth: proposal ? "DERIVED" : "UNKNOWN",
                canDo: "look up one recorded proposal by id",
                approval:
                  "approve/deny runs only through the witnessed POST on the served tree, never from this shell",
                happened: proposal
                  ? `lookup was attempted (http ${String((proposal as Record<string, unknown>).httpStatus)})`
                  : "no lookup performed yet",
              }}
            >
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input
                  value={proposalId}
                  onChange={(e) => setProposalId(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && lookupProposal()}
                  placeholder="proposal id"
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #3a3a4e",
                    background: "#14141c",
                    color: "#eceaf6",
                  }}
                />
                <button
                  onClick={lookupProposal}
                  style={{
                    padding: "10px 18px",
                    borderRadius: 8,
                    border: "none",
                    background: "#4a3568",
                    color: "#fff",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Look up
                </button>
              </div>
              {proposal && <J v={proposal} />}
              {!proposal && (
                <p style={{ color: "#9a97b5", fontSize: 12 }}>
                  The served GET returns the recorded proposal: digest, status,
                  summary, canonical bytes. There is no list endpoint yet, so
                  the subsections below stay honest-empty until one is wired.
                </p>
              )}
            </Card>
            {item === "pending" && (
              <EmptyState
                lane="Pending approvals"
                owner="MC approval store (no list endpoint wired yet)"
              />
            )}
            {item === "approved" && (
              <EmptyState
                lane="Approved"
                owner="MC approval store (no list endpoint wired yet)"
              />
            )}
            {item === "rejected" && (
              <EmptyState
                lane="Rejected"
                owner="MC approval store (no list endpoint wired yet)"
              />
            )}
            {item === "effects" && (
              <EmptyState
                lane="Approval effects"
                owner="MC_APPROVAL_APPROVED / MC_APPROVAL_DENIED journal events (no projection wired yet)"
              />
            )}
          </>
        )}

        {/* ============ SYSTEM ============ */}
        {view === "system/capabilities" && (
          <EmptyState lane="Capabilities" owner="TenantOS lane (capability enforcement)" />
        )}
        {view === "system/integrations" && (
          <>
            {!today && <p>Loading live state...</p>}
            {today && (
              <Card
                title="Integrations"
                health={(today.status as Health) ?? "DEGRADED"}
                prov={{
                  source: "/api/mc/today services (:3100 /api/health plus journal gateway 18199)",
                  owner: "Pig services",
                  truth: "OBSERVED",
                  canDo: "inspect which integrations respond",
                  approval: "nothing here is an action",
                  happened: "integration health was polled this pass",
                }}
              >
                <J
                  v={{
                    services: (today as Record<string, unknown>).services,
                    degraded: today.degraded,
                  }}
                />
              </Card>
            )}
          </>
        )}
        {view === "system/health" && (
          <>
            {!today && <p>Loading live state...</p>}
            {today && (
              <>
                <Card
                  title="Health"
                  health={(today.status as Health) ?? "DEGRADED"}
                  prov={{
                    source: "/api/mc/today status plus degraded list",
                    owner: "MC lane",
                    truth: "OBSERVED",
                    canDo: "inspect what is degraded",
                    approval: "nothing here is an action",
                    happened: "health was composed from live checks this pass",
                  }}
                >
                  <J
                    v={{
                      status: today.status,
                      degraded: today.degraded,
                    }}
                  />
                </Card>
                <Card
                  title="Repo state"
                  health="PROVEN"
                  prov={todayProv("repoState", "OBSERVED", "git state was read this pass")}
                >
                  <J v={t("repoState")} />
                </Card>
              </>
            )}
          </>
        )}
        {view === "system/event-history" && (
          <>
            {!today && <p>Loading live state...</p>}
            {today && (
              <>
                <Card
                  title="Event history (journal)"
                  health="PROVEN"
                  prov={{
                    source: "/api/mc/today changed (FYD_SITE_OVERLAY events from journal gateway 18199)",
                    owner: "PING journal",
                    truth: "OBSERVED",
                    canDo: "inspect recent events; open FYD / Objects for per-event forward traces",
                    approval: "nothing here is an action",
                    happened: "recent overlay events were read this pass",
                  }}
                >
                  <J v={t("changed")} />
                </Card>
                <Card
                  title="Not yet wired"
                  health="PROTOTYPE"
                  prov={todayProv("event-history-prototype", "UNKNOWN", "nothing observed")}
                >
                  <p style={{ color: "#9a97b5", fontSize: 12, margin: 0 }}>
                    A unified cross-stream event history with replay cursors is
                    not wired yet. The journal gateway is the canonical source;
                    this projection does not invent one.
                  </p>
                </Card>
              </>
            )}
          </>
        )}
        {view === "system/replay" && (
          <EmptyState lane="Replay receipts" owner="Authenticated PING replay APIs exist; a frontend read adapter is not wired yet." />
        )}
        </details>
      </div>
    </div>
  );
}

function CrmFetchError({
  title,
  data,
}: {
  title: string;
  data: Record<string, unknown>;
}) {
  return (
    <Card
      title={title}
      health="DEGRADED"
      prov={{
        source: "GET /api/mc/crm (fetch from this shell)",
        owner: "CRM harvest lane",
        truth: "UNKNOWN",
        canDo: "nothing (the projection did not answer)",
        approval: "check the served :3100 tree",
        happened: `fetch failed: ${String(data.error ?? "unreachable")}`,
      }}
    >
      <p style={{ color: "#9a97b5", margin: 0 }}>
        The CRM projection did not answer from this shell:{" "}
        {String(data.error ?? "unreachable")}. Nothing is invented in its place.
      </p>
    </Card>
  );
}

const COMPANY_ROWS: { keys: string[]; label: string }[] = [
  { keys: ["siteId"], label: "Site ID" },
  { keys: ["name"], label: "Name" },
  { keys: ["schema"], label: "Schema" },
  { keys: ["location"], label: "Location" },
  { keys: ["services"], label: "Services" },
  { keys: ["provenanceKind", "provenance"], label: "Provenance kind" },
  { keys: ["graphDigest", "digest"], label: "Graph digest" },
];

function CompanyCard({ c }: { c: Record<string, unknown> }) {
  // DERIVED is the file's standing badge for a composed graph projection
  // (see FYD / Objects); the API projects tenant graphs, so the same applies
  // unless the item claims otherwise.
  const truth = asTruth(c.truth ?? "DERIVED");
  return (
    <Card
      title={String(c.name ?? c.siteId ?? "company")}
      health="PROVEN"
      prov={{
        source: "GET /api/mc/crm?view=companies (read-only projection of the FYD tenant graphs)",
        owner: "FYD tenant graph (PING), projected by the CRM harvest lane",
        truth,
        canDo: "inspect the business record",
        approval: "no writes from this view",
        happened: `company projected from tenant graph ${String(c.siteId ?? "?")}`,
      }}
    >
      <div className="mc-field-grid">
        {COMPANY_ROWS.map((r) => (
          <div key={r.label} className="mc-field-row">
            <span>{r.label}</span>
            <details><summary>{fieldView(c, r.keys).text}</summary><p>Source: company projection · {String(c.siteId ?? "site not returned")} · {truth.toLowerCase()}. Field-level author and observation time are not returned by this endpoint.</p></details>
          </div>
        ))}
      </div>
    </Card>
  );
}

function LeadCard({ lead, index }: { lead: Record<string, unknown>; index: number }) {
  const truths =
    (lead.fieldTruth as Record<string, unknown> | undefined) ??
    (lead.truths as Record<string, unknown> | undefined) ??
    {};
  const get = (keys: string[]) => fieldView(lead, keys, truths);
  const who = get(["who"]);
  const what = get(["what", "whatTheyWant"]);
  const fydNode = get(["fydNode", "whichFydNode", "node"]);
  const service = get(["service", "whichService"]);
  const when = get(["when"]);
  const source = get(["source"]);
  const status = get(["status"]);
  const nextAction = get(["nextAction"]);
  const ev = evidenceRefs(lead.evidence);
  const isNew = status.text.trim().toUpperCase() === "NEW";
  const nextText = isNew
    ? `Owner review: contact withheld until owner approval.${
        nextAction.text !== "(not returned)" ? ` ${nextAction.text}` : ""
      }`
    : nextAction.text;

  const rows: { label: string; text: string; truth: Truth }[] = [
    { label: "WHO", ...who },
    { label: "WHAT THEY WANT", ...what },
    { label: "WHICH FYD NODE", ...fydNode },
    { label: "WHICH SERVICE", ...service },
    { label: "WHEN", ...when },
    { label: "SOURCE", ...source },
    { label: "STATUS", ...status },
  ];

  return (
    <Card
      title={`Lead ${String(lead.id ?? index + 1)}`}
      health="PROVEN"
      prov={{
        source:
          "GET /api/mc/crm?view=leads (journal visitor-intent events projected onto the FYD tenant graphs)",
        owner: "PING journal plus FYD tenant graph, projected by the CRM harvest lane",
        truth: "DERIVED",
        canDo: "inspect the lead fields and evidence refs",
        approval:
          "contacting this lead needs owner authority; NEW leads show owner review with contact withheld",
        happened: `lead projected from visitor-intent events (${isNew ? "NEW, awaiting owner review" : "status " + status.text})`,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "180px 1fr",
          gap: 4,
          fontSize: 12,
        }}
      >
        {rows.map((r) => (
          <div key={r.label} style={{ display: "contents" }}>
            <div style={{ color: "#9a97b5", fontWeight: 600 }}>
              {r.label} <TruthBadge t={r.truth} />
            </div>
            <div style={{ wordBreak: "break-word" }}>{r.text}</div>
          </div>
        ))}
        <div style={{ display: "contents" }}>
          <div style={{ color: "#9a97b5", fontWeight: 600 }}>
            EVIDENCE <TruthBadge t={ev.truth} />
          </div>
          <div style={{ wordBreak: "break-word" }}>
            <div>Journal event: {ev.journal}</div>
            <div>Graph objects: {ev.objects}</div>
          </div>
        </div>
        <div style={{ display: "contents" }}>
          <div style={{ color: "#9a97b5", fontWeight: 600 }}>
            NEXT ACTION <TruthBadge t={nextAction.truth} />
          </div>
          <div style={{ wordBreak: "break-word", fontWeight: isNew ? 700 : 400 }}>
            {nextText}
          </div>
        </div>
      </div>
    </Card>
  );
}

function ForwardButtons({
  evidence,
  setForward,
}: {
  evidence: Record<string, unknown>;
  setForward: (v: Record<string, unknown> | null) => void;
}) {
  const items = (evidence.journalEvidence ?? []) as Record<string, unknown>[];
  const ids = items
    .map((j) => (j.lookup as Record<string, unknown> | undefined))
    .filter(Boolean)
    .map(
      (l) =>
        ((l as Record<string, unknown>).event as Record<string, unknown> | undefined)
          ?.event_id
    )
    .filter(Boolean) as string[];
  if (!ids.length) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <p style={{ fontSize: 12, color: "#9a97b5" }}>
        Forward trace: what did each source change affect downstream?
      </p>
      {ids.map((id) => (
        <button
          key={id}
          onClick={() =>
            fetch(`/api/mc/trace-forward?eventId=${encodeURIComponent(id)}`)
              .then((r) => r.json())
              .then(setForward)
          }
          style={{
            marginRight: 8,
            marginBottom: 6,
            background: "#1c1c28",
            border: "1px solid #3a3a4e",
            color: "#8ab8ff",
            padding: "6px 10px",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          Trace forward: {id}
        </button>
      ))}
    </div>
  );
}
