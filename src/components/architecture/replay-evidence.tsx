"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const CHAIN = [
  { id: "E1", label: "EVENT E1", detail: "Something happened. Recorded with timestamp, source, and version.", color: "#C9A227" },
  { id: "M1", label: "MISSION M1", detail: "The event triggered a mission: the objective to pursue.", color: "#7C5CD6" },
  { id: "A3", label: "AGENT A3", detail: "The agent assigned, with explicit capability grants.", color: "#1A1729" },
  { id: "ACT", label: "ACTION", detail: "The concrete operation the agent performed.", color: "#8B9BB4" },
  { id: "R1", label: "RESULT R1", detail: "What the action produced, with evidence attached.", color: "#2E5A4F" },
  { id: "W1", label: "WITNESS W1", detail: "The permanent attestation: who, what, when, with what authority.", color: "#7C5CD6" },
  { id: "L1", label: "LINEAGE L1", detail: "The full chain, queryable. Every step links to its cause.", color: "#C9A227" },
];

const REPLAY_STEPS = [
  "E1 + runtime / version / context",
  "re-execution",
  "compare",
  "MATCH / DIVERGENCE",
];

export function ReplayEvidence() {
  const [activeChain, setActiveChain] = useState(0);
  const [replayPhase, setReplayPhase] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const t1 = setInterval(() => setActiveChain((i) => (i + 1) % CHAIN.length), 1200);
    const t2 = setInterval(() => setReplayPhase((i) => (i + 1) % REPLAY_STEPS.length), 1800);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, [reducedMotion]);

  return (
    <div className="w-full" role="img" aria-label="Evidence chain from event through mission, agent, action, result, witness, and lineage, alongside the replay process that re-executes and compares for match or divergence.">
      <div className="grid gap-10 md:grid-cols-2">
        {/* Evidence chain */}
        <div>
          <h3 className="mb-4 text-sm font-bold uppercase tracking-widest text-text-muted">The evidence chain</h3>
          <ol className="relative space-y-0">
            {CHAIN.map((item, i) => (
              <li key={item.id} className="relative flex gap-4 pb-5 last:pb-0">
                {i < CHAIN.length - 1 && (
                  <span className="absolute left-[15px] top-8 h-[calc(100%-24px)] w-px bg-border-soft" aria-hidden="true" />
                )}
                <span
                  className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-all duration-500")}
                  style={{
                    borderColor: item.color,
                    backgroundColor: i === activeChain ? item.color : "transparent",
                    color: i === activeChain ? "#fff" : item.color,
                  }}
                  aria-hidden="true"
                >
                  {item.id}
                </span>
                <div className={cn("transition-opacity duration-500", i === activeChain ? "opacity-100" : "opacity-60")}>
                  <p className="text-sm font-bold uppercase tracking-wide text-text">{item.label}</p>
                  <p className="text-sm text-text-muted">{item.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        {/* Replay */}
        <div>
          <h3 className="mb-4 text-sm font-bold uppercase tracking-widest text-text-muted">Replay</h3>
          <div className="rounded-lg border border-border-soft bg-deep p-6">
            <ol className="space-y-4">
              {REPLAY_STEPS.map((step, i) => (
                <li key={step} className="flex items-center gap-3">
                  <span
                    className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all duration-500",
                      i === replayPhase ? "bg-honey text-deep" : "border border-text-on-dark/30 text-text-on-dark/50")}
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <span className={cn("font-mono text-sm transition-colors duration-500",
                    i === replayPhase ? "text-honey" : "text-text-on-dark/60")}>
                    {step}
                  </span>
                </li>
              ))}
            </ol>
            <div className="mt-6 border-t border-text-on-dark/10 pt-4">
              <p className="text-sm text-text-on-dark/80">
                Important automation leaves enough evidence to answer:
              </p>
              <ul className="mt-2 space-y-1 text-sm text-text-on-dark/60">
                <li>→ what happened</li>
                <li>→ what caused it</li>
                <li>→ which agent acted, with what authority</li>
                <li>→ what evidence existed</li>
                <li>→ whether behavior replays cleanly</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
