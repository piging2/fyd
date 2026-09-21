"use client";

const LAYERS = [
  {
    name: "PRESENTATION",
    color: "#8B9BB4",
    items: ["Tenant site", "Components", "Design tokens"],
  },
  {
    name: "TENANT",
    color: "#7C5CD6",
    items: ["tenant.ping.v1.json", "Identity", "Navigation", "Brand"],
  },
  {
    name: "CONTINUITY",
    color: "#C9A227",
    items: ["Events", "Evidence", "Knowledge", "Lineage"],
  },
  {
    name: "AGENTS",
    color: "#2E5A4F",
    items: ["Missions", "Capabilities", "Workers", "Replay"],
  },
  {
    name: "RUNTIME",
    color: "#1A1729",
    items: ["JS workers", "Python workers", "Local / Oracle / Cloud"],
  },
];

export function SystemTopology() {
  return (
    <div className="w-full" role="img" aria-label="PING system topology: presentation, tenant, continuity, agents, and runtime layers stacked from top to bottom.">
      <div className="space-y-0">
        {LAYERS.map((layer, i) => (
          <div key={layer.name} className="relative">
            <div
              className="rounded-lg border-l-4 bg-surface p-5"
              style={{ borderLeftColor: layer.color }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-mono text-sm font-bold uppercase tracking-widest text-text">
                  <span className="mr-3 text-text-muted">{String(i + 1).padStart(2, "0")}</span>
                  {layer.name}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {layer.items.map((item) => (
                    <span key={item} className="rounded-full bg-surface-2 px-3 py-1 font-mono text-[11px] text-text-muted">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            {i < LAYERS.length - 1 && (
              <div className="flex justify-center py-1" aria-hidden="true">
                <div className="h-4 w-px bg-border-soft" />
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-sm text-text-muted">
        Each layer has one job. Upper layers depend on lower layers, never the reverse.
      </p>
    </div>
  );
}
