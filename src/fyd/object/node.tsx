/**
 * Lane B: ObjectNode — the NODE projection.
 *
 * The full intelligent object experience of the SAME OBJECT that Circle and
 * Card project. Two planes, never mixed:
 *
 * - CENTER: the canonical content/object experience — name, kind, category,
 *   location, evidence-backed summary, facts, contact, rights-authorized
 *   media. Customer content, untouched; every claim carries its evidence
 *   basis.
 * - MARGINS (the context plane): object-driven contextual intelligence —
 *   related objects, Ask FYD sample questions, capability-gated actions,
 *   provenance. Rendered ONLY from real objects; never invented content.
 *   Every margin section omits itself when its data is absent.
 *
 * Placement is decided by geometry, not by hardcoded pixel breakpoints: a
 * wrapping flex row lets the margins fall below the center when the container
 * narrows. Same substrate as Circle/Card: stone/zinc/amber palette, shared
 * evidence chrome. No new design language, no per-customer CSS.
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

export interface ObjectNodeProps {
  /** The generic object projection: Business, Person, or Service. */
  projection: ObjectProjection;
  /** Node href; defaults to /o/<id>. */
  nodeHref?: string;
  className?: string;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
      {children}
    </h2>
  );
}

function Center({ projection }: { projection: ObjectProjection }) {
  const hero = projection.media.find(
    (m) => m.role === "hero" || m.role === "gallery",
  );
  const logo = projection.media.find((m) => m.role === "logo");
  const gallery = projection.media.filter((m) => m !== hero && m !== logo);
  const contactFacts = [projection.contact.phone, projection.contact.email, projection.contact.website].filter(
    (f): f is NonNullable<typeof f> => f !== null,
  );
  const subline = [projection.kindLabel, projection.category?.value]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="min-w-0 flex-[3] basis-72">
      {hero && (
        <img
          src={hero.src}
          alt={hero.alt}
          loading="lazy"
          className="mb-5 aspect-[21/9] w-full rounded-xl object-cover"
        />
      )}
      <div className="flex items-start gap-4">
        {logo ? (
          <img
            src={logo.src}
            alt={projection.name + " logo"}
            loading="lazy"
            className="h-16 w-16 shrink-0 rounded-full bg-white object-contain p-1 ring-1 ring-stone-200"
          />
        ) : (
          <InitialsMark name={projection.name} size="lg" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-stone-900">{projection.name}</h1>
          {subline && <p className="mt-1 text-sm text-stone-500">{subline}</p>}
          {projection.location && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-stone-600">
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
        <section aria-label="About" className="mt-5">
          <SectionTitle>About</SectionTitle>
          <p className="mt-2 text-base leading-relaxed text-stone-800">
            {projection.summary.value}
          </p>
          <div className="mt-2">
            <EvidenceMark
              claim={projection.summary.value}
              evidence={projection.summary.evidence}
            />
          </div>
        </section>
      )}

      {projection.facts.length > 0 && (
        <section aria-label="Facts" className="mt-5">
          <SectionTitle>Facts</SectionTitle>
          <dl className="mt-2 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white px-4">
            {projection.facts.map((f, i) => (
              <FactRow key={f.label + ":" + i} fact={f} />
            ))}
          </dl>
        </section>
      )}

      {contactFacts.length > 0 && (
        <section aria-label="Contact" className="mt-5">
          <SectionTitle>Contact</SectionTitle>
          <dl className="mt-2 divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white px-4">
            {contactFacts.map((f, i) => (
              <FactRow key={f.label + ":" + i} fact={f} />
            ))}
          </dl>
        </section>
      )}

      {gallery.length > 0 && (
        <section aria-label="Photos" className="mt-5">
          <SectionTitle>Photos</SectionTitle>
          <ul className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-2">
            {gallery.map((m) => (
              <li key={m.id}>
                <img
                  src={m.src}
                  alt={m.alt}
                  loading="lazy"
                  className="aspect-square w-full rounded-lg object-cover"
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Margins({
  projection,
  nodeHref,
}: {
  projection: ObjectProjection;
  nodeHref: string;
}) {
  const hasAny =
    projection.people.length > 0 ||
    projection.sampleQuestions.length > 0 ||
    projection.capabilities.length > 0;
  if (!hasAny) return null;
  return (
    <aside
      aria-label="Context"
      className="min-w-0 flex-[2] basis-60 space-y-6 rounded-xl border border-stone-200 bg-stone-50 p-5"
    >
      {projection.people.length > 0 && (
        <section aria-label="Related">
          <SectionTitle>Related</SectionTitle>
          <ul className="mt-2 divide-y divide-stone-200">
            {projection.people.map((r) => (
              <RelatedRow key={r.id} related={r} />
            ))}
          </ul>
        </section>
      )}

      {projection.sampleQuestions.length > 0 && (
        <section aria-label="Ask FYD" id="ask">
          <SectionTitle>Ask FYD</SectionTitle>
          <ul className="mt-2 space-y-2">
            {projection.sampleQuestions.map((q, i) => (
              <li key={i}>
                <a
                  href={nodeHref + "#ask"}
                  className="block rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 hover:bg-stone-100"
                >
                  {q}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {projection.capabilities.length > 0 && (
        <section aria-label="Actions">
          <SectionTitle>Actions</SectionTitle>
          <CapabilityActions
            capabilities={projection.capabilities}
            nodeHref={nodeHref}
            nodeObjectId={projection.id}
            className="mt-2"
          />
        </section>
      )}

      <section aria-label="Provenance">
        <SectionTitle>Provenance</SectionTitle>
        <p className="mt-2 text-xs leading-relaxed text-stone-500">
          {projection.provenance.label}
        </p>
        {projection.provenance.ref && (
          <p className="mt-1 break-all font-mono text-[11px] text-stone-400">
            {projection.provenance.ref}
          </p>
        )}
      </section>
    </aside>
  );
}

export function ObjectNode({ projection, nodeHref, className }: ObjectNodeProps) {
  const href = nodeHref ?? "/o/" + encodeURIComponent(projection.id);
  return (
    <div
      className={cn("mx-auto w-full max-w-5xl px-4 py-6", className)}
      data-object-id={projection.id}
      data-object-schema={projection.schema}
    >
      {/* CENTER/MARGINS: a wrapping flex row. Geometry decides placement:
          margins fall below the center when the container narrows. No
          hardcoded pixel breakpoints. */}
      <div className="flex flex-wrap items-start gap-6">
        <Center projection={projection} />
        <Margins projection={projection} nodeHref={href} />
      </div>
    </div>
  );
}
