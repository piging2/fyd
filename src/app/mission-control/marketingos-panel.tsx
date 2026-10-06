"use client";

/**
 * MarketingOS projection panel — rendered as a tab on the EXISTING Mission
 * Control page (one MC surface; no sibling dashboard).
 *
 * Reads the deterministic projectMarketingOS projection from
 * GET /api/mc/marketingos (live PING journal, read-only). Verdicts render in
 * the landed vocabulary: CONFIRMED green, UNCLEAR amber (never green),
 * REFUTED red. Every non-KNOWN field shows its machine-readable reason.
 */

import { useCallback, useEffect, useState } from "react";

type Epistemic = "KNOWN" | "UNKNOWN" | "NOT_STARTED" | "NOT_APPLICABLE" | "PENDING" | "CONFLICTING";

interface Field {
  state: Epistemic;
  reason?: string;
  data?: unknown;
  note?: string;
}

interface Projection {
  objective: { state: "KNOWN"; source: "operator"; text: string };
  mission: Field;
  research: Record<string, Field>;
  audience: Field;
  opportunity: Field;
  artifact: Field;
  approval: Field;
  distribution: Field;
  effect: Field;
  outcome: Field;
  learning: Field;
  next_question: Field;
  deployment: Field;
  stages?: {
    state: "UNKNOWN";
    reason: string;
    summary: string;
    projector_stages: string[];
    driver_stages: string[];
    note: string;
  };
}

interface MissionSummary {
  mission_id: string;
  status: string | null;
  tenant_id: string | null;
  created_at: string | null;
  event_count: number;
}

const STATE_STYLE: Record<Epistemic, { background: string; color: string }> = {
  KNOWN: { background: "#123f2a", color: "#7dffa8" },
  UNKNOWN: { background: "#2a2a32", color: "#9a97b5" },
  NOT_STARTED: { background: "#23232e", color: "#8a87a5" },
  NOT_APPLICABLE: { background: "#23232e", color: "#6a6785" },
  PENDING: { background: "#4a3410", color: "#ffcf7d" },
  CONFLICTING: { background: "#4a1a1a", color: "#ff8a8a" },
};

const VERDICT_STYLE: Record<string, { background: string; color: string }> = {
  CONFIRMED: { background: "#123f2a", color: "#7dffa8" },
  UNCLEAR: { background: "#4a3410", color: "#ffcf7d" },
  REFUTED: { background: "#4a1a1a", color: "#ff8a8a" },
};

function Badge({ text, style }: { text: string; style: { background: string; color: string } }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 10,
        fontSize: 11,
        fontWeight: 700,
        background: style.background,
        color: style.color,
        marginRight: 6,
      }}
    >
      {text}
    </span>
  );
}

function FieldRow({ name, field }: { name: string; field: Field }) {
  const s = STATE_STYLE[field.state] ?? STATE_STYLE.UNKNOWN;
  return (
    <div style={{ padding: "8px 0", borderBottom: "1px solid #23232e" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Badge text={field.state} style={s} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#eceaf6" }}>{name}</span>
        {field.reason && (
          <span style={{ fontSize: 11, color: "#9a97b5", fontFamily: "monospace" }}>
            {field.reason}
          </span>
        )}
      </div>
      {field.note && (
        <div style={{ fontSize: 12, color: "#9a97b5", marginTop: 4 }}>{field.note}</div>
      )}
    </div>
  );
}

function J({ v }: { v: unknown }) {
  return (
    <pre
      style={{
        fontSize: 11,
        color: "#b9b9d6",
        background: "#14141c",
        borderRadius: 8,
        padding: 10,
        overflowX: "auto",
        marginTop: 6,
      }}
    >
      {JSON.stringify(v, null, 1)}
    </pre>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid #2e2e3e",
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
        background: "#1a1a24",
      }}
    >
      <h3 style={{ fontSize: 14, margin: "0 0 8px", color: "#eceaf6" }}>{title}</h3>
      {children}
    </div>
  );
}

export default function MarketingOSPanel() {
  const [missions, setMissions] = useState<MissionSummary[] | null>(null);
  const [missionsErr, setMissionsErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [projection, setProjection] = useState<Projection | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [journal, setJournal] = useState<string | null>(null);
  const [projErr, setProjErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/mc/marketingos/missions", { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ http: r.status, j })))
      .then(({ http, j }) => {
        if (http !== 200 || !j.ok) {
          setMissionsErr(`missions list failed: ${String(j.error ?? http)} ${String(j.detail ?? "")}`);
          return;
        }
        const list = (j.missions ?? []) as MissionSummary[];
        setMissions(list);
        if (list.length > 0 && selectedId === null) {
          // Light up the latest mission that has reached canonical events;
          // a freshly-chained follow-up (no events yet) is selectable but
          // never the default view.
          const lit = list.find((m) => (m.event_count ?? 0) > 0) ?? list[0];
          setSelectedId(lit.mission_id);
        }
      })
      .catch((e) => setMissionsErr(`missions list error: ${String(e)}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProjection = useCallback((missionId: string | null) => {
    setLoading(true);
    setProjErr(null);
    const qs = missionId ? `?mission_id=${encodeURIComponent(missionId)}` : "";
    fetch(`/api/mc/marketingos${qs}`, { cache: "no-store" })
      .then((r) => r.json().then((j) => ({ http: r.status, j })))
      .then(({ http, j }) => {
        setLoading(false);
        if (http !== 200 || !j.ok) {
          setProjection(null);
          setProjErr(`projection failed: ${String(j.error ?? http)} ${String(j.detail ?? "")}`);
          return;
        }
        setAsOf(String(j.as_of ?? ""));
        setJournal(String(j.journal ?? ""));
        setProjection(j.projection as Projection);
      })
      .catch((e) => {
        setLoading(false);
        setProjection(null);
        setProjErr(`projection error: ${String(e)}`);
      });
  }, []);

  useEffect(() => {
    if (missions !== null) loadProjection(selectedId);
  }, [missions, selectedId, loadProjection]);

  const p = projection;
  const emptyState =
    p !== null &&
    (p.mission as Field).state === "NOT_STARTED" &&
    (p.mission as Field).reason === "NO_REACHED_MISSION";

  return (
    <>
      <Card title="MarketingOS projection — live PING journal (read-only)">
        <p style={{ fontSize: 12, color: "#9a97b5", marginTop: 0 }}>
          Deterministic projection of INTELLIGENCE_RESEARCH missions from the live
          journal. The projection never writes, never invents: every KNOWN field cites
          its canonical record; everything else renders as an explicit epistemic state.
        </p>
        {missionsErr && <p style={{ color: "#ff8a8a", fontSize: 13 }}>{missionsErr}</p>}
        {missions === null && !missionsErr && <p style={{ fontSize: 13 }}>Loading missions...</p>}
        {missions !== null && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: "#b9b9d6" }}>
              Mission{" "}
              <select
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(e.target.value === "" ? null : e.target.value)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #3a3a4e",
                  background: "#14141c",
                  color: "#eceaf6",
                  fontSize: 12,
                }}
              >
                <option value="">(none) — honest empty state</option>
                {missions.map((m) => (
                  <option key={m.mission_id} value={m.mission_id}>
                    {m.mission_id.slice(0, 13)}… · {m.status} · {m.tenant_id} · {m.event_count ?? 0} events
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => loadProjection(selectedId)}
              style={{
                padding: "8px 16px",
                borderRadius: 8,
                border: "none",
                background: "#4a3568",
                color: "#fff",
                fontWeight: 700,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Refresh
            </button>
            {asOf && (
              <span style={{ fontSize: 11, color: "#6a6785", fontFamily: "monospace" }}>
                as_of {asOf}
              </span>
            )}
          </div>
        )}
        {journal && (
          <p style={{ fontSize: 11, color: "#6a6785", fontFamily: "monospace", marginBottom: 0 }}>
            journal: {journal}
          </p>
        )}
      </Card>

      {loading && <p style={{ fontSize: 13 }}>Projecting...</p>}
      {projErr && <p style={{ color: "#ff8a8a", fontSize: 13 }}>{projErr}</p>}

      {p && emptyState && (
        <Card title="Empty state — honest, no mission">
          <p style={{ fontSize: 13, color: "#eceaf6" }}>
            No reached INTELLIGENCE_RESEARCH mission exists for this objective. Research
            state: NOT STARTED. Evidence: NONE. Claims: NONE. Opportunity assessment:
            UNKNOWN (no verified demand observations). Artifact: NONE. Approval: NOT
            REQUESTED. Distribution: NOT ATTEMPTED. Outcome: NOT OBSERVED. Learning: NONE.
          </p>
          <J v={p} />
        </Card>
      )}

      {p && !emptyState && (
        <>
          <Card title="Mission">
            <FieldRow name="mission" field={p.mission} />
            {p.mission.state === "KNOWN" && <J v={p.mission.data} />}
          </Card>

          <Card title="Research">
            <FieldRow name="sources" field={p.research.sources} />
            {p.research.sources.state === "KNOWN" && <J v={p.research.sources.data} />}
            <FieldRow name="observations" field={p.research.observations} />
            {p.research.observations.state === "KNOWN" && <J v={p.research.observations.data} />}
            <FieldRow name="claims" field={p.research.claims} />
            {p.research.claims.state === "KNOWN" &&
              (((p.research.claims.data as { claims: Array<Record<string, unknown>> })?.claims) ?? []).map(
                (c) => {
                  const verdict = String(c.verdict ?? "UNCLEAR");
                  return (
                    <div
                      key={String(c.claim_id)}
                      style={{
                        border: "1px solid #2e2e3e",
                        borderRadius: 8,
                        padding: 10,
                        margin: "8px 0",
                        background: "#14141c",
                      }}
                    >
                      <Badge text={verdict} style={VERDICT_STYLE[verdict] ?? VERDICT_STYLE.UNCLEAR} />
                      <span style={{ fontSize: 12, color: "#9a97b5", fontFamily: "monospace" }}>
                        {String(c.claim_id).slice(0, 13)} · {String(c.subject ?? "")}
                      </span>
                      <p style={{ fontSize: 13, color: "#eceaf6", margin: "6px 0" }}>
                        {String(c.text ?? "")}
                      </p>
                      <div style={{ fontSize: 11, color: "#6a6785", fontFamily: "monospace" }}>
                        drill-down: claim {String(c.claim_id).slice(0, 13)} → upstream{" "}
                        {String((c.source as Record<string, unknown>)?.upstream_event_id ?? "").slice(0, 13)} →
                        observations{" "}
                        {JSON.stringify(
                          ((c.source as Record<string, unknown>)?.observation_event_ids as string[] ?? []).map(
                            (id) => String(id).slice(0, 13),
                          ),
                        )}
                      </div>
                    </div>
                  );
                },
              )}
            <FieldRow name="evidence" field={p.research.evidence} />
            {p.research.evidence.state === "KNOWN" && <J v={p.research.evidence.data} />}
            <FieldRow name="contradictions" field={p.research.contradictions} />
            <FieldRow name="unknowns" field={p.research.unknowns} />
            {p.research.unknowns.state === "KNOWN" && <J v={p.research.unknowns.data} />}
          </Card>

          <Card title="Positioning">
            <FieldRow name="audience" field={p.audience} />
            <FieldRow name="opportunity" field={p.opportunity} />
            <FieldRow name="artifact" field={p.artifact} />
          </Card>

          <Card title="Action lifecycle">
            <FieldRow name="approval" field={p.approval} />
            {p.approval.state === "KNOWN" && <J v={p.approval.data} />}
            <FieldRow name="distribution" field={p.distribution} />
            <FieldRow name="effect" field={p.effect} />
            <FieldRow name="outcome" field={p.outcome} />
            <FieldRow name="learning" field={p.learning} />
            <FieldRow name="next_question" field={p.next_question} />
            {p.next_question.state === "KNOWN" && <J v={p.next_question.data} />}
          </Card>

          <Card title="Stages & deployment">
            {p.stages && (
              <div style={{ padding: "8px 0" }}>
                <Badge text={p.stages.summary} style={STATE_STYLE.UNKNOWN} />
                <span style={{ fontSize: 11, color: "#9a97b5", fontFamily: "monospace", marginLeft: 8 }}>
                  {p.stages.reason}
                </span>
                <div style={{ fontSize: 12, color: "#9a97b5", marginTop: 6 }}>
                  projector: {p.stages.projector_stages.join(" / ")} · driver:{" "}
                  {p.stages.driver_stages.join(" / ")}
                </div>
                <div style={{ fontSize: 12, color: "#9a97b5", marginTop: 4 }}>{p.stages.note}</div>
              </div>
            )}
            <FieldRow name="deployment" field={p.deployment} />
          </Card>
        </>
      )}
    </>
  );
}
