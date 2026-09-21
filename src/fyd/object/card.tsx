/**
 * Lane B: ObjectCard — the CARD/EMBED projection.
 *
 * The portable inline projection of the SAME OBJECT that Circle and Node
 * project. Compact, fast, embeddable: name, kind, category, location,
 * evidence-backed summary, top facts, real related objects, capability-gated
 * actions, provenance. Nothing invented: nulls and empty arrays omit their
 * sections; unknown claims render their label with an Unknown mark and no
 * value; actions derive ONLY from projection.capabilities.
 *
 * Same substrate as the Circle primitive: stone/zinc/amber Tailwind palette,
 * the shared EvidenceMark / CapabilityActions chrome. No new design language,
 * no per-customer CSS.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import type { ObjectProjection } from "./object-projection";
import {
  CapabilityActions,
  EvidenceMark,
  FactRow,
  InitialsMark,
  RelatedRow,
} from "./evidence-chrome";

export interface ObjectCardProps {
  /** The generic object projection: Business, Person, or Service. */
  projection: ObjectProjection;
  /** Node href; defaults to /o/<id>. */
  nodeHref?: string;
  className?: string;
  /** Max facts before the list is trimmed. Default 5. */
  maxFacts?: number;
}

function LogoMark({ projection }: { projection: ObjectProjection }) {
  const logo = projection.media.find((m) => m.role === "logo");
  if (logo) {
    return (
      <img
        src={logo.src}
        alt={projection.name + " logo"}
        loading="lazy"
        className="h-10 w-10 shrink-0 rounded-full bg-white object-contain p-1"
      />
    );
  }
  return <InitialsMark name={projection.name} size="sm" />;
}

export function ObjectCard({
  projection,
  nodeHref,
  className,
  maxFacts = 5,
}: ObjectCardProps) {
  const href = nodeHref ?? "/o/" + encodeURIComponent(projection.id);
  const facts = projection.facts.slice(0, maxFacts);
  const subline = [projection.kindLabel, projection.category?.value]
    .filter(Boolean)
    .join(" · ");

  return (
    <article
      aria-label={projection.kindLabel + ": " + projection.name}
      className={cn(
        "w-full max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-sm",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <LogoMark projection={projection} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-stone-900">
            <a href={href} className="hover:underline">
              {projection.name}
            </a>
          </p>
          {subline && <p className="truncate text-sm text-stone-500">{subline}</p>}
          {projection.location && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-600">
              <span>{projection.location.value || "Location"}</span>
              <EvidenceMark
                claim={projection.location.value || projection.location.label}
                evidence={projection.location.evidence}
              />
            </p>
          )}
        </div>
      </div>

      {projection.summary && (
        <div className="mt-3">
          <p className="text-sm text-stone-700">{projection.summary.value}</p>
          <div className="mt-1">
            <EvidenceMark
              claim={projection.summary.value}
              evidence={projection.summary.evidence}
            />
          </div>
        </div>
      )}

      {facts.length > 0 && (
        <dl className="mt-3 divide-y divide-stone-100 border-t border-stone-100">
          {facts.map((f, i) => (
            <FactRow key={f.label + ":" + i} fact={f} />
          ))}
        </dl>
      )}

      {projection.people.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Related
          </p>
          <ul className="mt-1 divide-y divide-stone-100">
            {projection.people.map((r) => (
              <RelatedRow key={r.id} related={r} />
            ))}
          </ul>
        </div>
      )}

      <CapabilityActions
        capabilities={projection.capabilities}
        nodeHref={href}
        className="mt-4"
      />

      <p className="mt-4 text-xs text-stone-400">{projection.provenance.label}</p>
    </article>
  );
}
