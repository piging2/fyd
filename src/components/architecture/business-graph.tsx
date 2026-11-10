"use client";

import { useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface GraphNode {
  id: string;
  label: string;
  detail: string;
  x: number;
  y: number;
  color: string;
}

interface GraphEdge {
  from: string;
  to: string;
  label: string;
}

const NODES: GraphNode[] = [
  { id: "customer", label: "CUSTOMER", detail: "The person or business. Identity persists across every interaction.", x: 220, y: 40, color: "#7C5CD6" },
  { id: "event", label: "EVENT", detail: "A call came in. Recorded as canonical event E-01J with timestamp and source.", x: 80, y: 140, color: "#C9A227" },
  { id: "property", label: "PROPERTY", detail: "The site. Address, access notes, history of every visit.", x: 360, y: 140, color: "#7C5CD6" },
  { id: "lead", label: "LEAD", detail: "Created from the event. Status, source, and every touchpoint tracked.", x: 80, y: 250, color: "#C9A227" },
  { id: "project", label: "PROJECT", detail: "The job. Scope, schedule, documents, and decisions in one place.", x: 220, y: 250, color: "#7C5CD6" },
  { id: "person", label: "PERSON", detail: "Assigned technician. Skills, availability, and past work on this property.", x: 80, y: 360, color: "#2E5A4F" },
  { id: "service", label: "SERVICE", detail: "What was sold. Linked to estimate, parts, and warranty terms.", x: 360, y: 360, color: "#2E5A4F" },
  { id: "estimate", label: "ESTIMATE", detail: "The quote. Line items, version history, and approval state.", x: 360, y: 460, color: "#C9A227" },
  { id: "job", label: "JOB", detail: "Scheduled work. Who, when, what was done, and the evidence.", x: 220, y: 460, color: "#2E5A4F" },
  { id: "review", label: "REVIEW", detail: "The outcome. Linked back to job, person, and customer.", x: 220, y: 560, color: "#7C5CD6" },
];

const EDGES: GraphEdge[] = [
  { from: "customer", to: "event", label: "called" },
  { from: "customer", to: "property", label: "owns" },
  { from: "event", to: "lead", label: "created" },
  { from: "property", to: "project", label: "has" },
  { from: "lead", to: "project", label: "became" },
  { from: "lead", to: "person", label: "assigned" },
  { from: "project", to: "service", label: "needs" },
  { from: "person", to: "job", label: "performed" },
  { from: "service", to: "estimate", label: "priced" },
  { from: "estimate", to: "job", label: "approved" },
  { from: "job", to: "review", label: "rated" },
];

function getNode(id: string) {
  return NODES.find((node) => node.id === id)!;
}

export function BusinessGraph({ dark = false }: { dark?: boolean } = {}) {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedNode = selected ? getNode(selected) : null;
  const relationships = EDGES.filter((edge) => edge.from === selected || edge.to === selected);

  return (
    <div className="w-full">
      <p className={cn("mb-4 text-center text-sm", dark ? "text-text-on-dark/70" : "text-text-muted")}>
        Illustrative model of business relationships, not live data. The generic knowledge
        graph is built; a business-domain graph is a direction.
      </p>
      <div className="mx-auto grid items-start gap-6 xl:max-w-4xl xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="relative mx-auto grid w-full max-w-[560px] grid-cols-2 gap-2 md:block">
          <svg viewBox="0 0 440 620" className="hidden w-full md:block" aria-hidden="true" focusable="false">
            {EDGES.map((edge) => {
              const from = getNode(edge.from);
              const to = getNode(edge.to);
              const highlighted = edge.from === selected || edge.to === selected;
              return (
                <g key={edge.from + "-" + edge.to} opacity={selected && !highlighted ? 0.2 : 1} className="transition-opacity motion-reduce:transition-none">
                  <line
                    x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                    stroke="currentColor"
                    strokeOpacity={highlighted ? 0.6 : 0.25}
                    strokeWidth={highlighted ? 2 : 1}
                    className={dark ? "text-text-on-dark" : "text-text"}
                  />
                  <text
                    x={(from.x + to.x) / 2}
                    y={(from.y + to.y) / 2 - 9}
                    textAnchor="middle"
                    className={cn(dark ? "fill-text-on-dark/70" : "fill-text-muted", "text-[9px] uppercase tracking-wide")}
                  >
                    {edge.label}
                  </text>
                </g>
              );
            })}
          </svg>
          {NODES.map((node) => (
            <button
              key={node.id}
              type="button"
              aria-pressed={selected === node.id}
              onClick={() => setSelected(node.id)}
              style={{
                "--node-x": (100 * node.x / 440) + "%",
                "--node-y": (100 * node.y / 620) + "%",
                "--node-color": node.color,
              } as CSSProperties}
              className={cn(
                "min-h-11 min-w-0 rounded-lg border border-[color:var(--node-color)] px-1 text-xs font-bold uppercase tracking-wide",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current",
                "md:absolute md:top-[var(--node-y)] md:left-[var(--node-x)] md:w-[22%] md:-translate-x-1/2 md:-translate-y-1/2",
                dark ? "bg-deep-2 text-text-on-dark hover:bg-deep" : "bg-surface text-text hover:bg-surface-muted",
                selected === node.id && "underline underline-offset-4 ring-2 ring-[color:var(--node-color)]"
              )}
            >
              {node.label}
            </button>
          ))}
        </div>
        <div className="min-h-36 rounded-lg border border-border-soft bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-x-3">
            <p className="text-sm font-bold text-text" aria-live="polite">
              {selectedNode ? selectedNode.label + " relationships" : "Explore a relationship"}
            </p>
            <button
              type="button"
              aria-disabled={!selectedNode}
              className="min-h-11 rounded text-xs font-semibold text-text-muted underline underline-offset-4 focus-visible:outline-2 aria-disabled:no-underline"
              onClick={() => setSelected(null)}
            >
              Clear selection
            </button>
          </div>
          {selectedNode ? (
            <>
              <p className="mt-1 text-sm text-text-muted">{selectedNode.detail}</p>
              <ul className="mt-3 space-y-1 text-sm text-text">
                {relationships.map((edge) => (
                  <li key={edge.from + "-" + edge.to}>
                    {getNode(edge.from).label} → {edge.label} → {getNode(edge.to).label}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1 text-sm text-text-muted">Choose a node to see what it represents and how it connects.</p>
          )}
        </div>
      </div>
      <noscript>
        <dl className="mt-4 space-y-2 text-sm">
          {NODES.map((node) => (
            <div key={node.id}>
              <dt className="font-semibold">{node.label}</dt>
              <dd>{node.detail}</dd>
            </div>
          ))}
        </dl>
        <ul className="mt-4 space-y-1 text-sm">
          {EDGES.map((edge) => (
            <li key={edge.from + "-" + edge.to}>{getNode(edge.from).label} → {edge.label} → {getNode(edge.to).label}</li>
          ))}
        </ul>
      </noscript>
    </div>
  );
}
