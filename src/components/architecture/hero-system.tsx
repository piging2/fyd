"use client";

import { useEffect, useState } from "react";

const NODES = [
  { label: "INPUT", sub: "call · email · form" },
  { label: "EVENT", sub: "01J · canonical" },
  { label: "KNOWLEDGE", sub: "graph updated" },
  { label: "MISSION", sub: "objective set" },
  { label: "AGENT", sub: "capability grant" },
  { label: "EVIDENCE", sub: "result + proof" },
  { label: "REPLAY", sub: "verified" },
];

export function HeroSystem() {
  const [active, setActive] = useState(0);
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
    const interval = setInterval(() => setActive((a) => (a + 1) % NODES.length), 1300);
    return () => clearInterval(interval);
  }, [reducedMotion]);

  return (
    <div
      className="w-full rounded-xl border border-text-on-dark/15 bg-deep-2 p-6"
      role="img"
      aria-label="Live PING architecture flow: input becomes event, knowledge, mission, agent action, evidence, and verified replay."
    >
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-text-on-dark/50">ping · live system</span>
        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-green-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" aria-hidden="true" />
          operational
        </span>
      </div>
      <ol className="space-y-0">
        {NODES.map((node, i) => {
          const isActive = i === active;
          const isPast = i < active;
          return (
            <li key={node.label} className="relative">
              <div className="flex items-center gap-4 py-2.5">
                <span
                  className="font-mono text-[10px] text-text-on-dark/40 w-6"
                  aria-hidden="true"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className={`h-2.5 w-2.5 rounded-full border transition-all duration-500 ${
                    isActive ? "border-honey bg-honey scale-125" : isPast ? "border-honey/60 bg-honey/30" : "border-text-on-dark/25"
                  }`}
                  aria-hidden="true"
                />
                <div className="flex-1">
                  <span className={`font-mono text-xs font-bold uppercase tracking-widest transition-colors duration-500 ${isActive ? "text-honey" : "text-text-on-dark/80"}`}>
                    {node.label}
                  </span>
                  <span className="ml-3 font-mono text-[11px] text-text-on-dark/45">{node.sub}</span>
                </div>
                {node.label === "REPLAY" && isActive && (
                  <span className="font-mono text-xs text-green-400" aria-hidden="true">✓</span>
                )}
              </div>
              {i < NODES.length - 1 && (
                <div className="ml-[42px] h-3 w-px bg-text-on-dark/15" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
      <div className="mt-4 border-t border-text-on-dark/10 pt-3">
        <p className="font-mono text-[10px] uppercase tracking-widest text-text-on-dark/40">
          record before intelligence
        </p>
      </div>
    </div>
  );
}
