"use client";

import { useCallback, useEffect, useState } from "react";

type Health = "PROVEN" | "DEGRADED" | "PROTOTYPE";

// First-class display semantics (technology lane, 2026-09-24).
// Every technology field carries one of these. UI CLAIM <= BACKEND PROOF.
type Claim8 =
  | "PROVEN"
  | "OBSERVED"
  | "DERIVED"
  | "UNKNOWN"
  | "STALE"
  | "CONFLICTING"
  | "PROTOTYPE"
  | "UNWIRED";

type BadgeState = Health | Claim8;

const BADGE_STYLE: Record<BadgeState, { background: string; color: string; border?: string }> = {
  PROVEN: { background: "#123f2a", color: "#7dffa8" },
  OBSERVED: { background: "#1a2f4a", color: "#8ab8ff" },
  DERIVED: { background: "#2b2140", color: "#c9a8ff" },
  UNKNOWN: { background: "#2a2a32", color: "#9a97b5" },
  STALE: { background: "#4a3410", color: "#ffcf7d" },
  CONFLICTING: { background: "#4a1a1a", color: "#ff8a8a" },
  PROTOTYPE: { background: "#3a3a4a", color: "#b9b9d6" },
  UNWIRED: { background: "#14141c", color: "#6a6785", border: "1px dashed #4a4a5e" },
  DEGRADED: { background: "#4a3410", color: "#ffcf7d" },
};

function Badge({ h }: { h: BadgeState }) {
  const style = BADGE_STYLE[h] ?? BADGE_STYLE.UNKNOWN;
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

function Card({
  title,
  health,
  children,
}: {
  title: string;
  health: Health;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: "1px solid #2c2c3a",
        borderRadius: 10,
        padding: 14,
        marginBottom: 12,
        background: "#14141c",
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>{title}</h3>
        <Badge h={health} />
      </div>
      <div style={{ fontSize: 13, color: "#cfcfe0" }}>{children}</div>
    </section>
  );
}

function J({ v }: { v: unknown }) {
  return (
    <pre
      style={{
        fontSize: 11,
        overflowX: "auto",
        background: "#0c0c12",
        padding: 8,
        borderRadius: 6,
        maxHeight: 340,
        overflowY: "auto",
      }}
    >
      {JSON.stringify(v, null, 2)}
    </pre>
  );
}

const TABS = ["TODAY", "AGENTS", "BUSINESSES", "WEBSITES", "TECHNOLOGY", "SEARCH"] as const;

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
  const [tab, setTab] = useState<(typeof TABS)[number]>("TODAY");
  const [today, setToday] = useState<Record<string, unknown> | null>(null);
  const [agents, setAgents] = useState<Record<string, unknown> | null>(null);
  const [siteId, setSiteId] = useState("happy-place");
  const [graph, setGraph] = useState<Record<string, unknown> | null>(null);
  const [trace, setTrace] = useState<Record<string, unknown> | null>(null);
  const [forward, setForward] = useState<Record<string, unknown> | null>(null);
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<Record<string, unknown> | null>(null);
  const [tech, setTech] = useState<Record<string, unknown> | null>(null);
  const [techDetail, setTechDetail] = useState<"postgresBackup" | "gateway" | null>(null);

  useEffect(() => {
    fetch("/api/mc/today", { cache: "no-store" })
      .then((r) => r.json())
      .then(setToday)
      .catch(() => setToday({ ok: false, status: "DEGRADED" }));
    fetch("/api/mc/agents", { cache: "no-store" })
      .then((r) => r.json())
      .then(setAgents)
      .catch(() => setAgents({ ok: false, status: "DEGRADED" }));
    fetch("/api/mc/technology", { cache: "no-store" })
      .then((r) => r.json())
      .then(setTech)
      .catch(() => setTech({ ok: false }));
  }, []);

  const loadGraph = useCallback(() => {
    fetch(`/api/mc/graph?siteId=${siteId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((g) => {
        setGraph(g);
        setTrace(null);
        setForward(null);
      });
  }, [siteId]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  const ask = useCallback(() => {
    if (!q.trim()) return;
    fetch(`/api/mc/search?q=${encodeURIComponent(q)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setAnswer);
  }, [q]);

  const g = (k: string) => (graph?.[k] ?? null) as unknown;
  const t = (k: string) =>
    (today as { today?: Record<string, unknown> } | null)?.today?.[k];
  const operations = (agents as { operations?: unknown[] } | null)?.operations ?? [];

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "18px 14px 60px",
        color: "#eceaf6",
        background: "#0a0a10",
        minHeight: "100vh",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <header style={{ marginBottom: 14 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 24 }}>Mission Control</h1>
        <p style={{ margin: 0, fontSize: 13, color: "#9a97b5" }}>
          Projection over proven backend state. Every badge says how the number
          was produced. No fake controls. Timeout never displays as FAILED.
        </p>
      </header>

      <nav style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map((x) => (
          <button
            key={x}
            onClick={() => setTab(x)}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #3a3a4e",
              background: tab === x ? "#2b2140" : "#14141c",
              color: "#eceaf6",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {x}
          </button>
        ))}
      </nav>

      {tab === "TODAY" && (
        <>
          {!today && <p>Loading live state...</p>}
          {today && (
            <>
              <Card title="Services" health={(today.status as Health) ?? "DEGRADED"}>
                <J
                  v={{
                    services: (today as Record<string, unknown>).services,
                    degraded: today.degraded,
                  }}
                />
              </Card>
              <Card title="Happening now" health="PROVEN">
                <J v={t("happening")} />
              </Card>
              <Card title="Changed" health="PROVEN">
                <J v={t("changed")} />
              </Card>
              <Card title="Failed (proven only)" health="PROVEN">
                <J v={t("failed")} />
              </Card>
              <Card title="Needs your authority" health="PROVEN">
                <J v={t("needsAuthority")} />
              </Card>
              <Card title="Will happen next" health="PROVEN">
                <J v={t("willHappenNext")} />
              </Card>
              <Card title="Repo state" health="PROVEN">
                <J v={t("repoState")} />
              </Card>
              <Card title="Not yet wired" health="PROTOTYPE">
                <J v={(today as Record<string, unknown>).prototype} />
              </Card>
            </>
          )}
        </>
      )}

      {tab === "AGENTS" && (
        <>
          <Card title="Control law" health="PROVEN">
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
            <>
              <Card title="Operations (per-operation fields)" health="PROVEN">
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
              <Card title="Scheduled agents (cron.d)" health="PROVEN">
                <J v={(agents as Record<string, unknown>).scheduledAgents} />
              </Card>
              <Card title="Live processes" health="PROVEN">
                <J v={(agents as Record<string, unknown>).processes} />
              </Card>
              <Card title="Withheld controls" health="PROVEN">
                <J v={(agents as Record<string, unknown>).controls} />
              </Card>
              <Card title="Not yet wired" health="PROTOTYPE">
                <J v={(agents as Record<string, unknown>).prototype} />
              </Card>
            </>
          )}
        </>
      )}

      {tab === "BUSINESSES" && (
        <>
          <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
            {(graph?.tenants as string[] | undefined)?.map((x) => (
              <button
                key={x}
                onClick={() => setSiteId(x)}
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
              <Card title={`Graph: ${siteId}`} health="PROVEN">
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
              <Card title="Objects (click for trace)" health="PROVEN">
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
                <Card title="Reverse trace: rendered value -> object -> claim -> evidence -> source" health="PROVEN">
                  <J v={(trace ?? {}) as Record<string, unknown>} />
                  {Boolean(
                    (
                      ((trace as Record<string, unknown>).trace as Record<string, unknown> | undefined)
                        ?.evidence as Record<string, unknown> | undefined
                    )?.journalEvidence
                  ) && (
                    <ForwardButtons
                      evidence={
                        (
                          (trace as Record<string, unknown>).trace as Record<string, unknown>
                        ).evidence as Record<string, unknown>
                      }
                      setForward={setForward}
                    />
                  )}
                </Card>
              )}
              {forward && (
                <Card title="Forward trace: source change -> website" health="PROVEN">
                  <J v={forward} />
                </Card>
              )}
            </>
          )}
        </>
      )}

      {tab === "WEBSITES" && (
        <>
          <Card title="Live sites" health="PROVEN">
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
          <Card title="Not yet wired" health="PROTOTYPE">
            SiteSpec view, object/source coverage numbers, missing-evidence
            list, mobile/desktop QA, accessibility, performance, visual QA,
            regeneration history, deployment view. These are real backends
            that exist (FYD factory); the projection is not built yet.
          </Card>
        </>
      )}

      {tab === "TECHNOLOGY" && (
        <>
          {!tech && <p>Loading proven technology state...</p>}
          {tech && tech.ok === false && (
            <p>Technology projection unavailable.</p>
          )}
          {tech && tech.ok !== false && (
            <>
              <Card title="Claim legend — UI CLAIM <= BACKEND PROOF" health="PROVEN">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                  {Object.entries(
                    (tech.claimLegend ?? {}) as Record<string, string>
                  ).map(([k, def]) => (
                    <span key={k} style={{ fontSize: 12 }}>
                      <Badge h={k as BadgeState} />{" "}
                      <span style={{ color: "#9a97b5" }}>{def}</span>
                    </span>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: "#9a97b5", margin: "8px 0 0" }}>
                  Projected from this host only, at request time (
                  {String(tech.generatedAt ?? "unknown")}). A missing backend
                  renders as UNWIRED or UNKNOWN, never as a green number.
                  Cross-host fleet evidence is cited as such, never smuggled
                  into this host's numbers.
                </p>
              </Card>

              <Card title="Technology tree" health="PROVEN">
                <TechTree
                  nodes={(tech.views as Record<string, unknown>).tree as unknown[]}
                  onDetail={setTechDetail}
                />
              </Card>

              {techDetail === "postgresBackup" && (
                <Card title="Postgres backup — this host" health="PROVEN">
                  <ClaimedFields
                    v={(tech.views as Record<string, unknown>).postgresBackup as Record<string, unknown>}
                  />
                  <button onClick={() => setTechDetail(null)} style={detailClose}>
                    Close
                  </button>
                </Card>
              )}
              {techDetail === "gateway" && (
                <Card title="Gateway — release, health, evidence" health="PROVEN">
                  <ClaimedFields
                    v={(tech.views as Record<string, unknown>).gateway as Record<string, unknown>}
                  />
                  <button onClick={() => setTechDetail(null)} style={detailClose}>
                    Close
                  </button>
                </Card>
              )}

              <Card title="Active incidents" health="PROVEN">
                {((tech.incidents as unknown[]) ?? []).length === 0 && (
                  <p>No incidents observed.</p>
                )}
                {((tech.incidents as unknown[]) ?? []).map((i) => (
                  <TechObjectCard key={String((i as Record<string, unknown>).id)} o={i as Record<string, unknown>} />
                ))}
              </Card>

              <Card title="Risks (derived)" health="PROVEN">
                {((tech.risks as unknown[]) ?? []).map((r) => (
                  <TechObjectCard key={String((r as Record<string, unknown>).id)} o={r as Record<string, unknown>} />
                ))}
              </Card>

              <Card title="Backlog objects — missing backends, traced" health="PROVEN">
                <p style={{ fontSize: 12, color: "#9a97b5" }}>
                  Missing backends are backlog objects, not fake UI. Each
                  names the concrete mutation, the owning authority, the
                  existing mechanism to trace, the capability that should
                  express it, the witnessing event, the confirming read
                  model, and the shortest real path. No new control-plane
                  framework.
                </p>
                {((tech.backlog as unknown[]) ?? []).map((b) => (
                  <TechObjectCard key={String((b as Record<string, unknown>).id)} o={b as Record<string, unknown>} />
                ))}
              </Card>

              <Card title="All technology objects" health="PROVEN">
                {Object.entries(
                  groupByKind((tech.objects as unknown[]) ?? [])
                ).map(([kind, items]) => (
                  <details key={kind} style={{ marginBottom: 8 }}>
                    <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                      {kind} ({items.length})
                    </summary>
                    <div style={{ marginTop: 8 }}>
                      {items.map((o) => (
                        <TechObjectCard
                          key={String((o as Record<string, unknown>).id)}
                          o={o as Record<string, unknown>}
                        />
                      ))}
                    </div>
                  </details>
                ))}
              </Card>
            </>
          )}
        </>
      )}

      {tab === "SEARCH" && (
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
            >
              <J v={answer} />
            </Card>
          )}
        </>
      )}
    </main>
  );
}

const detailClose = {
  marginTop: 10,
  background: "#1c1c28",
  border: "1px solid #3a3a4e",
  color: "#eceaf6",
  padding: "6px 12px",
  borderRadius: 6,
  cursor: "pointer",
} as const;

function groupByKind(items: unknown[]): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const i of items) {
    const k = String((i as Record<string, unknown>).kind ?? "?");
    (out[k] ??= []).push(i);
  }
  return out;
}

function TechTree({
  nodes,
  onDetail,
}: {
  nodes: unknown[];
  onDetail: (d: "postgresBackup" | "gateway") => void;
}) {
  return (
    <ul style={{ listStyle: "none", padding: 0, fontSize: 13 }}>
      {(nodes ?? []).map((n, i) => {
        const node = n as Record<string, unknown>;
        return (
          <li key={i} style={{ marginBottom: 6 }}>
            <span style={{ fontWeight: 700 }}>{String(node.label)}</span>
            {typeof node.detail === "string" && (
              <button
                onClick={() =>
                  onDetail(node.detail as "postgresBackup" | "gateway")
                }
                style={{
                  marginLeft: 8,
                  background: "#2b2140",
                  border: "1px solid #4a3568",
                  color: "#c9a8ff",
                  padding: "3px 10px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                open detail
              </button>
            )}
            {Array.isArray(node.children) && (
              <ul style={{ listStyle: "none", padding: "4px 0 0 18px" }}>
                {node.children.map((c, j) => (
                  <li key={j} style={{ color: "#cfcfe0", marginBottom: 3 }}>
                    {String((c as Record<string, unknown>).label)}
                  </li>
                ))}
              </ul>
            )}
            {Array.isArray(node.objectIds) && (
              <ul style={{ listStyle: "none", padding: "4px 0 0 18px" }}>
                {node.objectIds.map((id, j) => (
                  <li key={j} style={{ color: "#9a97b5", fontSize: 12, marginBottom: 2 }}>
                    {String(id)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function isClaimed(v: unknown): v is { value: unknown; claim: BadgeState; note?: string; evidence?: string } {
  return (
    typeof v === "object" &&
    v !== null &&
    "claim" in v &&
    typeof (v as Record<string, unknown>).claim === "string"
  );
}

function ClaimedValue({ v }: { v: unknown }) {
  if (isClaimed(v)) {
    return (
      <span>
        <Badge h={v.claim} />{" "}
        {v.value === null || v.value === undefined ? (
          <span style={{ color: "#6a6785", fontStyle: "italic" }}>not present</span>
        ) : (
          <span style={{ wordBreak: "break-word" }}>
            {typeof v.value === "object" ? JSON.stringify(v.value) : String(v.value)}
          </span>
        )}
        {v.note && (
          <span style={{ color: "#9a97b5", fontSize: 11 }}> — {v.note}</span>
        )}
        {v.evidence && (
          <span style={{ color: "#9a97b5", fontSize: 11 }}> (evidence: {v.evidence})</span>
        )}
      </span>
    );
  }
  if (Array.isArray(v)) {
    return (
      <ul style={{ margin: "4px 0", paddingLeft: 18 }}>
        {v.map((x, i) => (
          <li key={i} style={{ marginBottom: 2 }}>
            <ClaimedValue v={x} />
          </li>
        ))}
      </ul>
    );
  }
  if (typeof v === "object" && v !== null) {
    return <ClaimedFields v={v as Record<string, unknown>} />;
  }
  return <span>{String(v ?? "")}</span>;
}

function ClaimedFields({ v }: { v: Record<string, unknown> }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 6, fontSize: 12 }}>
      {Object.entries(v).map(([k, val]) => (
        <div key={k} style={{ display: "contents" }}>
          <div style={{ color: "#9a97b5", fontWeight: 600 }}>{k}</div>
          <div>
            <ClaimedValue v={val} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TechObjectCard({ o }: { o: Record<string, unknown> }) {
  const fields = (o.fields ?? {}) as Record<string, unknown>;
  const fieldClaims = (o.fieldClaims ?? {}) as Record<string, BadgeState>;
  return (
    <div
      style={{
        border: "1px solid #2c2c3a",
        borderRadius: 8,
        padding: 10,
        marginBottom: 10,
        background: "#0e0e16",
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 13 }}>{String(o.name)}</strong>
        <Badge h={(o.claim as BadgeState) ?? "UNKNOWN"} />
        <span style={{ fontSize: 11, color: "#6a6785" }}>
          {String(o.kind)} · {String(o.id)}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 4, fontSize: 12 }}>
        {Object.entries(fields).map(([k, val]) => (
          <div key={k} style={{ display: "contents" }}>
            <div style={{ color: "#9a97b5" }}>
              {k} <Badge h={fieldClaims[k] ?? "UNKNOWN"} />
            </div>
            <div style={{ wordBreak: "break-word", color: "#cfcfe0" }}>
              {val === null || val === undefined ? (
                <span style={{ color: "#6a6785", fontStyle: "italic" }}>not present</span>
              ) : typeof val === "object" ? (
                JSON.stringify(val)
              ) : (
                String(val)
              )}
            </div>
          </div>
        ))}
      </div>
      {typeof o.evidence === "string" && o.evidence && (
        <div style={{ fontSize: 11, color: "#6a6785", marginTop: 6 }}>
          evidence: {o.evidence}
        </div>
      )}
      {typeof o.note === "string" && o.note && (
        <div style={{ fontSize: 11, color: "#c9a8ff", marginTop: 4 }}>
          {o.note}
        </div>
      )}
    </div>
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
    .map((l) => ((l as Record<string, unknown>).event as Record<string, unknown> | undefined)?.event_id)
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
