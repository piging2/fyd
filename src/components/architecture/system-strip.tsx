"use client";

const ITEMS = [
  { label: "EVENT SOURCING", sub: "record first" },
  { label: "KNOWLEDGE GRAPH", sub: "tenant-aware" },
  { label: "CAPABILITY BOUNDARIES", sub: "evidence-based" },
  { label: "REPLAY", sub: "human authority" },
];

export function SystemStrip() {
  return (
    <div className="border-y border-text-on-dark/10 bg-deep-2">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px lg:grid-cols-4">
        {ITEMS.map((item) => (
          <div key={item.label} className="px-6 py-5 text-center">
            <p className="font-mono text-xs font-bold uppercase tracking-widest text-honey">{item.label}</p>
            <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-text-on-dark/55">{item.sub}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
