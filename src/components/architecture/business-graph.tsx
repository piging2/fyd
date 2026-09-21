"use client";

import { useState } from "react";
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

export function BusinessGraph() {
  const [selected, setSelected] = useState<string | null>(null);
  const selectedNode = NODES.find((n) => n.id === selected);

  const getNode = (id: string) => NODES.find((n) => n.id === id)!;

  return (
    <div className="w-full">
      <div className="hidden md:block">
        <svg viewBox="0 0 440 620" className="mx-auto w-full max-w-[560px]" role="img" aria-label="Business graph showing relationships between customer, events, leads, projects, people, services, estimates, jobs, and reviews.">
          {EDGES.map((edge) => {
            const from = getNode(edge.from);
            const to = getNode(edge.to);
            const isHighlighted = selected && (edge.from === selected || edge.to === selected);
            return (
              <g key={`${edge.from}-${edge.to}`} opacity={selected && !isHighlighted ? 0.2 : 1} className="transition-opacity duration-300">
                <line
                  x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                  stroke="currentColor"
                  strokeOpacity={isHighlighted ? 0.6 : 0.25}
                  strokeWidth={isHighlighted ? 2 : 1}
                  className="text-text"
                />
                <text
                  x={(from.x + to.x) / 2}
                  y={(from.y + to.y) / 2 - 6}
                  textAnchor="middle"
                  className="fill-text-muted text-[9px] uppercase tracking-wide"
                >
                  {edge.label}
                </text>
              </g>
            );
          })}
          {NODES.map((node) => (
            <g key={node.id}>
              <button
                onClick={() => setSelected(selected === node.id ? null : node.id)}
                onMouseEnter={() => setSelected(node.id)}
                onMouseLeave={() => setSelected(null)}
                onFocus={() => setSelected(node.id)}
                onBlur={() => setSelected(null)}
                aria-label={`${node.label}: ${node.detail}`}
                style={{ cursor: "pointer" }}
              >
                <rect
                  x={node.x - 55}
                  y={node.y - 18}
                  width={110}
                  height={36}
                  rx={8}
                  fill={selected === node.id ? node.color : "transparent"}
                  fillOpacity={selected === node.id ? 0.15 : 0}
                  stroke={node.color}
                  strokeWidth={selected === node.id ? 2.5 : 1.5}
                  className="transition-all duration-300"
                />
                <text
                  x={node.x}
                  y={node.y + 4}
                  textAnchor="middle"
                  className={cn(
                    "text-[11px] font-bold uppercase tracking-wide",
                    selected === node.id ? "fill-text" : "fill-text"
                  )}
                >
                  {node.label}
                </text>
              </button>
            </g>
          ))}
        </svg>
        {selectedNode && (
          <div className="mx-auto mt-4 max-w-md rounded-lg border border-border-soft bg-surface p-4 text-center" aria-live="polite">
            <p className="text-sm font-bold uppercase tracking-wide" style={{ color: selectedNode.color }}>
              {selectedNode.label}
            </p>
            <p className="mt-1 text-sm text-text-muted">{selectedNode.detail}</p>
          </div>
        )}
        {!selectedNode && (
          <p className="mt-4 text-center text-sm text-text-muted">
            Hover or tap a node to see what PING knows about it.
          </p>
        )}
        <p className="mt-6 text-center text-xs text-text-muted">
          Illustrative model of business relationships, not live data. The generic knowledge
          graph is built; a business-domain graph is a direction.
        </p>
      </div>

      {/* Mobile: ordered list */}
      <div className="md:hidden">
        <ol className="space-y-3">
          {NODES.map((node, i) => (
            <li key={node.id} className="rounded-lg border border-border-soft bg-surface p-4">
              <div className="flex items-center gap-3">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                  style={{ backgroundColor: node.color }}
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-bold uppercase tracking-wide text-text">{node.label}</p>
                  <p className="text-sm text-text-muted">{node.detail}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-text-muted">
          On desktop this renders as an interactive graph. The relationships: customer called (event), owns (property); event created (lead); lead became (project), assigned (person); project needs (service); service priced (estimate); estimate approved (job); job rated (review).
        </p>
        <p className="mt-3 text-xs text-text-muted">
          Illustrative model, not live data. The generic knowledge graph is built;
          a business-domain graph is a direction.
        </p>
      </div>
    </div>
  );
}
