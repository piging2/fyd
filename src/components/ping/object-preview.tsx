"use client";

/**
 * ObjectPreview: ONE composable object-preview interaction.
 *
 * Composes: schema label + object + relationship context + the capability
 * plan's action row. A small per-schema field config picks which fields
 * get prominent blocks; every schema (including unknown ones) renders
 * through this single component. Unknown schema -> graceful generic
 * object preview: metadata, relationships, references, Ask PING.
 *
 * Missing field = omitted gracefully, never faked.
 */

import * as React from "react";
import Link from "next/link";
import {
  Briefcase,
  Building2,
  FileText,
  FolderKanban,
  HelpCircle,
  MapPin,
  Newspaper,
  Package,
  ScrollText,
  Tag,
  User,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CapabilityPlan, PingObject, PingRelationship } from "@/lib/ping/types";
import { ActionButtons } from "./action-buttons";

/** Schema -> prominent fields (in order). Everything else goes to "details". */
const SCHEMA_FIELD_CONFIG: Record<string, { label: string; fields: string[] }> = {
  "ping.social.post@1": { label: "Post", fields: [] },
  "ping.social.profile@1": { label: "Profile", fields: ["location", "category"] },
  "ping.social.person@1": { label: "Person", fields: ["location", "website"] },
  "ping.social.business@1": { label: "Business", fields: ["category", "location", "website"] },
  "ping.social.article@1": { label: "Article", fields: ["date", "tags", "url"] },
  "ping.social.project@1": { label: "Project", fields: ["status", "url", "tags"] },
  "ping.social.product@1": { label: "Product", fields: ["status", "offers", "url"] },
  "ping.social.service@1": { label: "Service", fields: ["category", "price", "url"] },
  "ping.social.location@1": { label: "Location", fields: ["address", "city"] },
  "ping.social.offer@1": { label: "Offer", fields: ["price", "validUntil", "url"] },
};

const SCHEMA_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "ping.social.post@1": ScrollText,
  "ping.social.profile@1": User,
  "ping.social.person@1": User,
  "ping.social.business@1": Building2,
  "ping.social.article@1": Newspaper,
  "ping.social.project@1": FolderKanban,
  "ping.social.product@1": Package,
  "ping.social.service@1": Wrench,
  "ping.social.location@1": MapPin,
  "ping.social.offer@1": Tag,
};

export function schemaLabel(schema: string): string {
  const known = SCHEMA_FIELD_CONFIG[schema];
  if (known) return known.label;
  const short = schema.split(".").pop() ?? schema;
  return short.replace(/@.*$/, "").replace(/_/g, " ") || "Object";
}

function SchemaIcon({ schema, className }: { schema: string; className?: string }) {
  const Icon = SCHEMA_ICONS[schema] ?? HelpCircle;
  return <Icon className={className} aria-hidden="true" />;
}

function FieldValue({ value }: { value: string | string[] }) {
  if (Array.isArray(value)) {
    return (
      <span className="flex flex-wrap gap-1.5">
        {value.map((v, i) => (
          <span key={i} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs text-accent/80">
            {v}
          </span>
        ))}
      </span>
    );
  }
  if (/^https?:\/\//.test(value)) {
    return (
      <a href={value} target="_blank" rel="noreferrer" className="text-ping-violet hover:underline">
        {value}
      </a>
    );
  }
  return <span>{value}</span>;
}

function fieldLabel(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

interface ObjectPreviewProps {
  object: PingObject;
  /** Relationships touching this object; used for the context line. */
  relationships?: PingRelationship[];
  plan?: CapabilityPlan | null;
  onAsk?: (prefill: string | null, objectId: string | null) => void;
  onChanged?: () => void;
  /** When true, the title links to the Node page. */
  linked?: boolean;
  className?: string;
}

export function ObjectPreview({
  object,
  relationships = [],
  plan = null,
  onAsk,
  onChanged,
  linked = true,
  className,
}: ObjectPreviewProps) {
  const config = SCHEMA_FIELD_CONFIG[object.schema];
  const prominent = config?.fields ?? [];
  const prominentEntries = prominent
    .map((k) => [k, object.fields[k]] as const)
    .filter(([, v]) => v !== undefined);
  const restEntries = Object.entries(object.fields).filter(([k]) => !prominent.includes(k)).slice(0, 8);

  const active = relationships.filter((r) => r.status === "active");
  const counts = new Map<string, number>();
  for (const r of active) counts.set(r.predicate, (counts.get(r.predicate) ?? 0) + 1);
  const contextLine =
    counts.size > 0
      ? [...counts.entries()].map(([p, n]) => `${n} ${p}`).join(", ")
      : null;

  const title = (
    <span className="flex items-center gap-2">
      <SchemaIcon schema={object.schema} className="h-4 w-4 shrink-0 text-ping-violet" />
      <span className="truncate">{object.title || object.id.slice(0, 12)}</span>
    </span>
  );

  return (
    <article
      aria-label={`${schemaLabel(object.schema)}: ${object.title}`}
      className={cn("rounded-xl border border-border/40 bg-surface p-4 shadow-[--shadow-card]", className)}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 text-sm font-semibold text-accent">
          {linked ? (
            <Link
              href={`/node/${encodeURIComponent(object.id)}`}
              className="rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet"
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </div>
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-accent/60">
            {schemaLabel(object.schema)}
          </span>
          {object.provenance.kind === "website-derived" ? (
            <span
              className="rounded-full bg-honey/15 px-2 py-0.5 text-xs font-medium text-accent/70"
              title={`Projected from website content: ${object.provenance.ref}`}
            >
              Website
            </span>
          ) : object.provenance.kind === "overlay-authored" ? (
            <span
              className="rounded-full bg-honey/15 px-2 py-0.5 text-xs font-medium text-accent/70"
              title={`Demo content added by the site operator, event ${object.provenance.ref}`}
            >
              Demo
            </span>
          ) : (
            <span
              className="rounded-full bg-forest/10 px-2 py-0.5 text-xs font-medium text-forest"
              title={`Canonical PING object, event ${object.provenance.ref}`}
            >
              PING
            </span>
          )}
        </span>
      </header>

      {object.description && (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-accent/80">{object.description}</p>
      )}

      {prominentEntries.length > 0 && (
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {prominentEntries.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs font-medium uppercase tracking-wide text-accent/50">{fieldLabel(k)}</dt>
              <dd className="mt-0.5 break-words text-accent/90">
                <FieldValue value={v} />
              </dd>
            </div>
          ))}
        </dl>
      )}

      {restEntries.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer rounded text-accent/60 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet">
            Details
          </summary>
          <dl className="mt-2 space-y-1.5">
            {restEntries.map(([k, v]) => (
              <div key={k} className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-accent/60">{fieldLabel(k)}:</dt>
                <dd className="min-w-0 flex-1 break-words text-accent/90">
                  <FieldValue value={v} />
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      {contextLine && <p className="mt-3 text-xs text-accent/50">{contextLine}</p>}

      {plan && plan.actions.length > 0 && (
        <div className="mt-3 border-t border-border-soft pt-3">
          <ActionButtons actions={plan.actions} onAsk={onAsk} onChanged={onChanged} />
        </div>
      )}

      <footer className="mt-3 flex items-center justify-between text-xs text-accent/40">
        <span className="inline-flex items-center gap-1">
          <Briefcase className="h-3 w-3" aria-hidden="true" />
          {object.provenance.kind === "website-derived"
            ? "Website projection"
            : object.provenance.kind === "overlay-authored"
              ? "Demo addition"
              : "Canonical object"}
        </span>
        {object.provenance.kind === "canonical-journal" && (
          <code className="rounded bg-surface-2 px-1" title={`Event ${object.provenance.ref}`}>
            {object.provenance.ref.slice(0, 12)}
          </code>
        )}
      </footer>
    </article>
  );
}
