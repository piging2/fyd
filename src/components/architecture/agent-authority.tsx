"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const CAPABILITIES = [
  { id: "read", label: "READ FILE", status: "ALLOWED", color: "#2E5A4F" },
  { id: "api", label: "CALL API", status: "ALLOWED", color: "#2E5A4F" },
  { id: "code", label: "MODIFY CODE", status: "APPROVAL", color: "#C9A227" },
];

const FLOW = [
  { label: "MISSION", detail: "The objective, defined by a human or a system rule." },
  { label: "CAPABILITY AUTHORITY", detail: "What this agent may do. Explicit grants, not vibes." },
  { label: "AGENT", detail: "Acts only within granted capabilities." },
  { label: "ACTION", detail: "The concrete operation performed." },
  { label: "RESULT + EVIDENCE", detail: "What happened, with proof attached." },
  { label: "WITNESS / LINEAGE", detail: "The permanent record. Replayable." },
];

export function AgentAuthority() {
  const [activeStep, setActiveStep] = useState(0);
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
    const interval = setInterval(() => {
      setActiveStep((s) => (s + 1) % FLOW.length);
    }, 1600);
    return () => clearInterval(interval);
  }, [reducedMotion]);

  return (
    <div className="w-full" role="img" aria-label="Agent authority flow: mission goes through capability authority which grants or restricts capabilities, then the agent acts, producing result with evidence and witness lineage.">
      <div className="hidden md:block">
        <svg viewBox="0 0 400 560" className="mx-auto w-full max-w-[440px]">
          <g opacity={activeStep === 0 ? 1 : 0.5} className="transition-opacity duration-500">
            <rect x={120} y={10} width={160} height={44} rx={8} fill="#7C5CD6" fillOpacity="0.15" stroke="#7C5CD6" strokeWidth="2" />
            <text x={200} y={37} textAnchor="middle" className="fill-text text-xs font-bold uppercase tracking-wide">Mission</text>
          </g>
          <line x1={200} y1={54} x2={200} y2={80} stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" className="text-text" />
          <g opacity={activeStep === 1 ? 1 : 0.5} className="transition-opacity duration-500">
            <rect x={90} y={80} width={220} height={44} rx={8} fill="#C9A227" fillOpacity="0.15" stroke="#C9A227" strokeWidth="2" />
            <text x={200} y={107} textAnchor="middle" className="fill-text text-xs font-bold uppercase tracking-wide">Capability Authority</text>
          </g>
          {CAPABILITIES.map((cap, i) => {
            const x = 70 + i * 130;
            return (
              <g key={cap.id} opacity={activeStep === 1 ? 1 : 0.45} className="transition-opacity duration-500">
                <line x1={200} y1={124} x2={x} y2={160} stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" className="text-text" />
                <rect x={x - 60} y={160} width={120} height={52} rx={8} fill={cap.color} fillOpacity="0.12" stroke={cap.color} strokeWidth="1.5" />
                <text x={x} y={182} textAnchor="middle" className="fill-text text-[10px] font-bold uppercase tracking-wide">{cap.label}</text>
                <text x={x} y={198} textAnchor="middle" className="text-[9px] font-semibold uppercase" fill={cap.color}>{cap.status}</text>
                <line x1={x} y1={212} x2={200} y2={248} stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" className="text-text" />
              </g>
            );
          })}
          <g opacity={activeStep === 2 ? 1 : 0.5} className="transition-opacity duration-500">
            <rect x={120} y={248} width={160} height={44} rx={8} fill="#1A1729" stroke="#1A1729" strokeWidth="2" />
            <text x={200} y={275} textAnchor="middle" className="fill-white text-xs font-bold uppercase tracking-wide">Agent</text>
          </g>
          <line x1={200} y1={292} x2={200} y2={318} stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" className="text-text" />
          <g opacity={activeStep === 3 ? 1 : 0.5} className="transition-opacity duration-500">
            <rect x={120} y={318} width={160} height={44} rx={8} fill="transparent" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1.5" className="text-text" />
            <text x={200} y={345} textAnchor="middle" className="fill-text text-xs font-bold uppercase tracking-wide">Action</text>
          </g>
          <line x1={200} y1={362} x2={200} y2={388} stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" className="text-text" />
          <g opacity={activeStep === 4 ? 1 : 0.5} className="transition-opacity duration-500">
            <rect x={100} y={388} width={200} height={44} rx={8} fill="#2E5A4F" fillOpacity="0.15" stroke="#2E5A4F" strokeWidth="2" />
            <text x={200} y={415} textAnchor="middle" className="fill-text text-xs font-bold uppercase tracking-wide">Result + Evidence</text>
          </g>
          <line x1={200} y1={432} x2={200} y2={458} stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" className="text-text" />
          <g opacity={activeStep === 5 ? 1 : 0.5} className="transition-opacity duration-500">
            <rect x={100} y={458} width={200} height={44} rx={8} fill="#7C5CD6" fillOpacity="0.15" stroke="#7C5CD6" strokeWidth="2" />
            <text x={200} y={485} textAnchor="middle" className="fill-text text-xs font-bold uppercase tracking-wide">Witness / Lineage</text>
          </g>
        </svg>
        <div className="mt-2 text-center" aria-live="polite">
          <p className="text-sm font-semibold text-text">{FLOW[activeStep].label}</p>
          <p className="text-sm text-text-muted">{FLOW[activeStep].detail}</p>
        </div>
      </div>
      <div className="md:hidden">
        <ol className="space-y-4">
          {FLOW.map((step, i) => (
            <li key={step.label} className={cn("rounded-lg border p-4 transition-colors", i === activeStep ? "border-honey bg-honey/5" : "border-border-soft bg-surface")}>
              <p className="text-sm font-bold uppercase tracking-wide text-text">
                <span className="mr-2 text-honey">{String(i + 1).padStart(2, "0")}</span>
                {step.label}
              </p>
              <p className="mt-1 text-sm text-text-muted">{step.detail}</p>
              {step.label === "CAPABILITY AUTHORITY" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {CAPABILITIES.map((cap) => (
                    <span key={cap.id} className="rounded-full px-3 py-1 text-xs font-semibold uppercase" style={{ backgroundColor: cap.color + "1A", color: cap.color, border: "1px solid " + cap.color }}>
                      {cap.label}: {cap.status}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-4 rounded-lg bg-deep p-4 text-center text-sm font-semibold text-text-on-dark">
          Intelligence does not imply authority.
        </p>
      </div>
      <p className="mt-6 hidden text-center text-lg font-semibold text-text md:block">
        Intelligence does not imply authority.
      </p>
    </div>
  );
}
