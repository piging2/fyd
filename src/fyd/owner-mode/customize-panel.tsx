/**
 * Lane D: the customize-with-FYD owner panel (DEMO ONLY).
 *
 * Renders inside DemoOwnerMode, which only mounts when
 * NEXT_PUBLIC_FYD_DEMO_OWNER_MODE=1 (localhost/private). The conversational
 * loop: plain English -> typed intent -> digest-bound proposal -> explicit
 * demo-owner approval -> journaled directive -> re-rendered spec.
 *
 * Parse and approve both go through /api/fyd/customize. The client never
 * applies anything: approval only journals an overlay event, and the
 * rendered page picks it up on the next projection dump.
 */

"use client";

import { useCallback, useEffect, useState } from "react";

interface ParsedProposal {
  intent: { kind: string; target: string };
  intentDigest: string;
  resolutionNote: string;
  siteIntent: unknown;
  proposal: Record<string, unknown>;
  reviewCard: { title: string; before: string[]; after: string[]; operationCount: number };
  specDigest: string;
}

interface ApiError {
  ok: false;
  code?: string;
  error: string;
}

interface InspectData {
  siteId: string;
  specDigest: string;
  baseSpecDigest: string;
  pageOrder: { pageSlug: string; sections: { id: string; component: string; hidden: boolean }[] }[];
  directives: {
    intentId: string;
    siteIntent: unknown;
    proposalDigest: string;
    approvedBy: string;
    approvedAt: string;
    eventId?: string;
    change: {
      title: string;
      before: string[];
      after: string[];
      operationCount: number;
    } | null;
  }[];
  appliedIntentIds: string[];
  unresolved: { intentId: string; reason: string }[];
}

type Phase = "idle" | "proposing" | "proposed" | "approving" | "done";

const card = {
  background: "#221b0e",
  border: "1px solid #6b5518",
  borderRadius: 8,
  padding: "12px 16px",
};

const label = {
  color: "#9c8a4d",
  fontSize: 11,
  textTransform: "uppercase" as const,
  letterSpacing: 1,
};

const body = { color: "#c9b98a", fontSize: 13, marginTop: 6 };

export function CustomizePanel({ siteId }: { siteId: string }) {
  const [text, setText] = useState("Move emergency plumbing first");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<ApiError | null>(null);
  const [proposal, setProposal] = useState<ParsedProposal | null>(null);
  const [approval, setApproval] = useState<{ intentId?: string; eventId: string; note: string } | null>(null);
  const [inspect, setInspect] = useState<InspectData | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);

  const refreshInspect = useCallback(async () => {
    try {
      const res = await fetch("/api/fyd/customize?siteId=" + encodeURIComponent(siteId) + "&view=inspect");
      const doc = (await res.json()) as (InspectData & { ok: boolean }) | ApiError;
      if ("ok" in doc && doc.ok) {
        setInspect(doc as InspectData);
        setInspectError(null);
      } else {
        setInspectError((doc as ApiError).error ?? "inspect failed");
      }
    } catch (e) {
      setInspectError(e instanceof Error ? e.message : String(e));
    }
  }, [siteId]);

  useEffect(() => {
    void refreshInspect();
  }, [refreshInspect]);

  const runParse = async () => {
    setPhase("proposing");
    setError(null);
    setProposal(null);
    setApproval(null);
    try {
      const res = await fetch("/api/fyd/customize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "parse", siteId, text }),
      });
      const doc = (await res.json()) as (ParsedProposal & { ok: boolean }) | ApiError;
      if ("ok" in doc && doc.ok) {
        setProposal(doc as ParsedProposal);
        setPhase("proposed");
      } else {
        setError(doc as ApiError);
        setPhase("idle");
      }
    } catch (e) {
      setError({ ok: false, error: e instanceof Error ? e.message : String(e) });
      setPhase("idle");
    }
  };

  const runApprove = async () => {
    if (!proposal) return;
    setPhase("approving");
    setError(null);
    try {
      const res = await fetch("/api/fyd/customize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve", siteId, text, proposal: proposal.proposal }),
      });
      const doc = (await res.json()) as
        | { ok: true; intentId?: string; eventId: string; note: string }
        | ApiError;
      if ("ok" in doc && doc.ok) {
        setApproval({ intentId: doc.intentId, eventId: doc.eventId, note: doc.note });
        setPhase("done");
        void refreshInspect();
      } else {
        setError(doc as ApiError);
        setPhase("proposed");
      }
    } catch (e) {
      setError({ ok: false, error: e instanceof Error ? e.message : String(e) });
      setPhase("proposed");
    }
  };

  const runClear = async (intentId: string) => {
    setError(null);
    try {
      const res = await fetch("/api/fyd/customize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear", siteId, intentId }),
      });
      const doc = (await res.json()) as { ok: boolean; error?: string };
      if (!doc.ok) {
        setError({ ok: false, error: doc.error ?? "clear failed" });
      }
      void refreshInspect();
    } catch (e) {
      setError({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <div style={{ ...card, marginTop: 16 }}>
      <div style={label}>Owner action: customize with FYD (demo)</div>
      <div style={body}>
        Describe a presentation change in plain English. FYD parses it into a
        typed intent, proposes a digest-bound site patch, and only applies it
        after you approve. Facts are never changed; the design system is not
        customizable here; unsupported requests are refused, not guessed at.
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Make the services section the first thing people see"
          aria-label="Customization request"
          style={{
            flex: 1,
            minWidth: 240,
            background: "#100c06",
            color: "#f5eeda",
            border: "1px solid #6b5518",
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 14,
          }}
        />
        <button
          type="button"
          onClick={runParse}
          disabled={phase === "proposing" || phase === "approving"}
          style={{
            background: "#f5c518",
            color: "#171208",
            fontWeight: 700,
            border: "none",
            borderRadius: 8,
            padding: "10px 16px",
            cursor: "pointer",
          }}
        >
          {phase === "proposing" ? "Parsing..." : "Review proposal"}
        </button>
      </div>

      {error ? (
        <div
          style={{
            marginTop: 12,
            background: "#2a1210",
            border: "1px solid #7a2e22",
            borderRadius: 8,
            padding: "10px 14px",
            color: "#f0a9a0",
            fontSize: 13,
          }}
          role="alert"
        >
          <strong>Not applied:</strong> {error.error}
          {error.code ? (
            <div style={{ fontSize: 12, marginTop: 4, color: "#c98a80" }}>
              code: {error.code}
            </div>
          ) : null}
        </div>
      ) : null}

      {proposal ? (
        <div
          style={{
            marginTop: 12,
            background: "#100c06",
            border: "1px solid #6b5518",
            borderRadius: 8,
            padding: "12px 14px",
          }}
        >
          <div style={{ color: "#f5eeda", fontWeight: 700, fontSize: 14 }}>
            {proposal.reviewCard.title}
          </div>
          <div style={{ color: "#c9b98a", fontSize: 13, marginTop: 6 }}>
            Typed intent: <code>{proposal.intent.kind}</code> on{" "}
            <code>{proposal.intent.target}</code>
          </div>
          <div style={{ color: "#c9b98a", fontSize: 13, marginTop: 4 }}>
            {proposal.resolutionNote}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={label}>Before</div>
              {proposal.reviewCard.before.map((line, i) => (
                <div key={i} style={{ color: "#9c8a4d", fontSize: 13, marginTop: 4 }}>
                  {line}
                </div>
              ))}
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={label}>After</div>
              {proposal.reviewCard.after.map((line, i) => (
                <div key={i} style={{ color: "#7fd08a", fontSize: 13, marginTop: 4 }}>
                  {line}
                </div>
              ))}
            </div>
          </div>
          <div style={{ color: "#9c8a4d", fontSize: 12, marginTop: 10 }}>
            proposal digest: <code>{String(proposal.proposal.proposalDigest).slice(0, 20)}...</code>
            {" "}· spec digest: <code>{proposal.specDigest.slice(0, 20)}...</code>
          </div>
          <button
            type="button"
            onClick={runApprove}
            disabled={phase !== "proposed"}
            style={{
              marginTop: 12,
              background: phase === "proposed" ? "#f5c518" : "#6b5518",
              color: "#171208",
              fontWeight: 700,
              border: "none",
              borderRadius: 8,
              padding: "10px 16px",
              cursor: phase === "proposed" ? "pointer" : "not-allowed",
            }}
          >
            {phase === "approving" ? "Recording approval..." : "Approve and apply (demo)"}
          </button>
          <div style={{ color: "#9c8a4d", fontSize: 12, marginTop: 8 }}>
            Approval journals a presentation-intent overlay event. DEMO OWNER
            MODE - not real authentication.
          </div>
        </div>
      ) : null}

      {approval ? (
        <div
          style={{
            marginTop: 12,
            background: "#122a18",
            border: "1px solid #2e7a44",
            borderRadius: 8,
            padding: "10px 14px",
            color: "#a9f0bd",
            fontSize: 13,
          }}
          role="status"
        >
          <strong>Approved and journaled.</strong>
          <div style={{ marginTop: 4 }}>
            intent: <code>{approval.intentId}</code> · event:{" "}
            <code>{approval.eventId}</code>
          </div>
          <div style={{ marginTop: 4, color: "#7fd08a" }}>{approval.note}</div>
        </div>
      ) : null}

      <div style={{ ...label, marginTop: 16 }}>Current presentation intent (live)</div>
      {inspectError ? (
        <div style={{ ...body, color: "#f0a9a0" }}>inspect unavailable: {inspectError}</div>
      ) : inspect ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ color: "#c9b98a", fontSize: 13 }}>
            Section order (home):{" "}
            {(inspect.pageOrder.find((p) => p.pageSlug === "home")?.sections ?? [])
              .map((s) => s.component + (s.hidden ? " (hidden)" : ""))
              .join(" → ") || "(no home page)"}
          </div>
          <div style={{ color: "#9c8a4d", fontSize: 12, marginTop: 4 }}>
            spec digest: <code>{inspect.specDigest.slice(0, 20)}...</code> · base:{" "}
            <code>{inspect.baseSpecDigest.slice(0, 20)}...</code>
          </div>
          {inspect.unresolved.map((u) => (
            <div key={u.intentId} style={{ ...body, color: "#f0a9a0" }}>
              Unresolved directive <code>{u.intentId}</code>: {u.reason}
            </div>
          ))}
          {inspect.directives.length === 0 ? (
            <div style={body}>No approved directives yet.</div>
          ) : (
            <ul style={{ listStyle: "none", margin: "8px 0 0", padding: 0 }}>
              {inspect.directives.map((d) => (
                <li key={d.intentId} style={{ marginTop: 8, fontSize: 13, color: "#c9b98a" }}>
                  <code style={{ color: "#f5eeda" }}>{d.intentId}</code> ·{" "}
                  {String(JSON.stringify(d.siteIntent))} ·
                  approved {d.approvedAt} by {d.approvedBy}
                  {d.eventId ? (
                    <span> · event <code>{d.eventId}</code></span>
                  ) : null}{" "}
                  {d.change ? (
                    <div style={{ marginTop: 4, fontSize: 12 }}>
                      <div style={{ color: "#9c8a4d" }}>What changed: {d.change.title}</div>
                      <div>Before: {d.change.before.join(" ")}</div>
                      <div>After: {d.change.after.join(" ")}</div>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => runClear(d.intentId)}
                    style={{
                      background: "transparent",
                      color: "#f5c518",
                      border: "1px solid #f5c518",
                      borderRadius: 6,
                      padding: "2px 10px",
                      fontSize: 12,
                      cursor: "pointer",
                      marginLeft: 8,
                    }}
                  >
                    Clear
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div style={body}>Loading current intent...</div>
      )}
    </div>
  );
}
