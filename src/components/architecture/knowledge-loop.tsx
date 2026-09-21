"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const STAGES = [
  { id: "input", label: "RAW INPUT", detail: "email · call · document · form · API", color: "#8B9BB4" },
  { id: "observation", label: "OBSERVATION", detail: "something happened", color: "#8B9BB4" },
  { id: "evidence", label: "EVIDENCE", detail: "source + confidence", color: "#C9A227" },
  { id: "event", label: "CANONICAL EVENT", detail: "recorded, immutable", color: "#C9A227" },
  { id: "knowledge", label: "KNOWLEDGE", detail: "verified understanding", color: "#7C5CD6" },
  { id: "graph", label: "BUSINESS GRAPH", detail: "relationships", color: "#7C5CD6" },
  { id: "playbook", label: "PLAYBOOK", detail: "learned procedure", color: "#7C5CD6" },
  { id: "automation", label: "AUTOMATION", detail: "agent acts", color: "#2E5A4F" },
  { id: "new-evidence", label: "NEW EVIDENCE", detail: "result recorded", color: "#2E5A4F" },
];

export function KnowledgeLoop() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const interval = setInterval(() => {
      setActiveIndex((i) => (i + 1) % STAGES.length);
    }, 1400);
    return () => clearInterval(interval);
  }, [reducedMotion]);

  const radius = 180;
  const center = 220;

  return (
    <div ref={containerRef} className="w-full" role="img" aria-label="Knowledge compounding loop: raw input becomes observation, evidence, canonical event, knowledge, business graph, playbook, automation, and new evidence, which feeds back into the loop.">
      {/* Desktop: circular loop */}
      <div className="hidden md:block">
        <svg viewBox="0 0 440 440" className="mx-auto w-full max-w-[520px]">
          {/* Loop circle */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.15"
            strokeWidth="1.5"
            strokeDasharray="4 6"
            className="text-text"
          />
          {/* Center label */}
          <text x={center} y={center - 8} textAnchor="middle" className="fill-text text-sm font-bold uppercase tracking-widest">
            Record Before
          </text>
          <text x={center} y={center + 14} textAnchor="middle" className="fill-text text-sm font-bold uppercase tracking-widest">
            Intelligence
          </text>
          {STAGES.map((stage, i) => {
            const angle = (i / STAGES.length) * 2 * Math.PI - Math.PI / 2;
            const x = center + radius * Math.cos(angle);
            const y = center + radius * Math.sin(angle);
            const isActive = i === activeIndex;
            return (
              <g key={stage.id}>
                <circle
                  cx={x}
                  cy={y}
                  r={isActive ? 10 : 7}
                  fill={isActive ? stage.color : "transparent"}
                  stroke={stage.color}
                  strokeWidth="2"
                  className="transition-all duration-500"
                />
                <text
                  x={x}
                  y={y - 18}
                  textAnchor="middle"
                  className={cn(
                    "text-[10px] font-semibold uppercase tracking-wide transition-opacity duration-500",
                    isActive ? "fill-text opacity-100" : "fill-text-muted opacity-60"
                  )}
                >
                  {stage.label}
                </text>
              </g>
            );
          })}
        </svg>
        {/* Active stage detail */}
        <div className="mt-4 text-center" aria-live="polite">
          <p className="text-sm font-semibold" style={{ color: STAGES[activeIndex].color }}>
            {STAGES[activeIndex].label}
          </p>
          <p className="text-sm text-text-muted">{STAGES[activeIndex].detail}</p>
        </div>
      </div>

      {/* Mobile: vertical sequence */}
      <div className="md:hidden">
        <ol className="relative space-y-0 border-l-2 border-border-soft pl-0">
          {STAGES.map((stage, i) => (
            <li key={stage.id} className="relative pb-6 pl-8 last:pb-0">
              <span
                className="absolute left-0 top-1 h-3 w-3 -translate-x-[7px] rounded-full border-2"
                style={{ borderColor: stage.color, backgroundColor: i === activeIndex ? stage.color : "transparent" }}
                aria-hidden="true"
              />
              <p className="text-sm font-bold uppercase tracking-wide text-text">{stage.label}</p>
              <p className="text-sm text-text-muted">{stage.detail}</p>
              {i === STAGES.length - 1 && (
                <p className="mt-2 text-xs font-semibold uppercase tracking-wide" style={{ color: stage.color }}>
                  ↺ feeds back to observation
                </p>
              )}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
