"use client";

const PILLARS = [
  {
    title: "IDENTITY",
    color: "#7C5CD6",
    items: ["Business", "People", "Agents", "Permissions"],
  },
  {
    title: "KNOWLEDGE",
    color: "#C9A227",
    items: ["Evidence", "Events", "Documents", "Relationships"],
  },
  {
    title: "OPERATIONS",
    color: "#2E5A4F",
    items: ["Missions", "Workflows", "Actions", "Results"],
  },
];

const TENANTS = [
  { id: "A", label: "Tenant A", items: "identity · namespace · knowledge · evidence · capabilities · workflows · history" },
  { id: "B", label: "Tenant B", items: "identity · namespace · knowledge · evidence · capabilities · workflows · history" },
  { id: "C", label: "Tenant C", items: "identity · namespace · knowledge · evidence · capabilities · workflows · history" },
];

export function TenantModel() {
  return (
    <div className="w-full" role="img" aria-label="TenantOS model: identity, knowledge, and operations pillars feed into the PING continuity layer, which serves authorized agents. Multiple tenants each have their own business graph on shared infrastructure.">
      {/* Three pillars */}
      <div className="grid gap-4 md:grid-cols-3">
        {PILLARS.map((pillar) => (
          <div key={pillar.title} className="rounded-lg border border-border-soft bg-surface p-5">
            <div className="mb-3 h-1.5 w-12 rounded-full" style={{ backgroundColor: pillar.color }} aria-hidden="true" />
            <h3 className="text-sm font-bold uppercase tracking-widest text-text">{pillar.title}</h3>
            <ul className="mt-3 space-y-2">
              {pillar.items.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-text-muted">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: pillar.color }} aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Convergence arrows */}
      <div className="my-2 flex justify-center" aria-hidden="true">
        <div className="flex gap-24">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-8 w-px bg-border-soft" />
          ))}
        </div>
      </div>

      <div className="text-center">
        <div className="mx-auto inline-block rounded-lg bg-deep px-8 py-4">
          <p className="text-sm font-bold uppercase tracking-widest text-text-on-dark">Ping Continuity Layer</p>
        </div>
      </div>

      <div className="mx-auto my-2 h-8 w-px bg-border-soft" aria-hidden="true" />

      <div className="text-center">
        <div className="mx-auto inline-block rounded-lg border-2 border-honey px-8 py-3">
          <p className="text-sm font-bold uppercase tracking-widest text-text">Authorized Agents</p>
        </div>
      </div>

      {/* Multi-tenant */}
      <div className="mt-12">
        <h3 className="mb-4 text-center text-sm font-bold uppercase tracking-widest text-text-muted">
          One infrastructure, many tenants
        </h3>
        <div className="rounded-lg border border-border-soft bg-surface-2 p-6">
          <p className="mb-4 text-center font-mono text-sm font-bold text-text">PING</p>
          <div className="grid gap-4 md:grid-cols-3">
            {TENANTS.map((t) => (
              <div key={t.id} className="rounded-lg border border-border-soft bg-surface p-4">
                <p className="text-sm font-bold text-text">{t.label}</p>
                <p className="mt-1 font-mono text-[11px] leading-relaxed text-text-muted">business graph</p>
                <p className="mt-2 text-xs text-text-muted">{t.items}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-sm text-text-muted">
            Each tenant is configuration plus content. Never a fork.
          </p>
        </div>
      </div>
    </div>
  );
}
