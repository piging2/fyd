"use client";

/**
 * Node page sections: a renderer REGISTRY (schema -> renderer), not eight
 * independent component architectures. Business, person, and generic
 * renderers compose the same shared section components in different
 * orders with different emphasis.
 *
 * Business: hero, description, website, location, services, people,
 *   content, social claims, related objects, Ask PING.
 * Person: identity, description, website, location if public, projects,
 *   posts, relationships, social claims, Ask PING.
 * Unknown object: generic metadata, relationships, references, Ask PING.
 */

import * as React from "react";
import Link from "next/link";
import { BadgeCheck, ExternalLink, MapPin } from "lucide-react";
import type { NodePayload, PingObject, PingRelationship } from "@/lib/ping/types";
import { ActionButtons } from "./action-buttons";
import { AskPingPanel } from "./ask-ping";
import { IntelligentCircle } from "./intelligent-circle";
import { ObjectPreview, schemaLabel } from "./object-preview";

export interface NodeSectionProps {
  node: NodePayload;
  onAsk: (prefill: string | null, objectId: string | null) => void;
  onChanged: () => void;
  askPrefill?: string | null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-xl border border-border/40 bg-surface p-4 sm:p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-accent/50">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase();
}

function fieldOf(obj: PingObject, ...names: string[]): string | null {
  for (const n of names) {
    const v = obj.fields[n];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (Array.isArray(v) && v.length > 0) return v.join(", ");
  }
  return null;
}

function websiteOf(obj: PingObject): string | null {
  return fieldOf(obj, "website", "url");
}

function HeroSection({ node }: { node: NodePayload }) {
  const { object } = node;
  const website = websiteOf(object);
  const location = fieldOf(object, "location", "address", "city");
  const category = fieldOf(object, "category", "businessCategory");
  return (
    <section aria-label="Hero" className="rounded-xl border border-border/40 bg-surface p-4 sm:p-6">
      <div className="flex items-start gap-4">
        <span
          aria-hidden="true"
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-ping-violet/15 text-2xl font-bold text-ping-violet"
        >
          {initials(object.title)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-accent/50">{schemaLabel(object.schema)}</p>
          <h1 className="mt-0.5 truncate text-2xl font-bold text-accent">{object.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-accent/70">
            {category && <span>{category}</span>}
            {location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                {location}
              </span>
            )}
            {website && (
              <a
                href={website.startsWith("http") ? website : `https://${website}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-ping-violet hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                Website
              </a>
            )}
          </div>
        </div>
      </div>
      {node.plan.actions.length > 0 && (
        <div className="mt-4 border-t border-border-soft pt-4">
          <ActionButtons actions={node.plan.actions} onAsk={() => {}} onChanged={() => {}} />
        </div>
      )}
    </section>
  );
}

function DescriptionSection({ node }: { node: NodePayload }) {
  if (!node.object.description) return null;
  return (
    <Section title="Description">
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-accent/85">{node.object.description}</p>
    </Section>
  );
}

function ServicesSection({ node }: { node: NodePayload }) {
  const servicesField = fieldOf(node.object, "services");
  const offerings = node.related.filter((o) =>
    ["ping.social.service@1", "ping.social.product@1", "ping.social.offer@1"].includes(o.schema),
  );
  if (!servicesField && offerings.length === 0) return null;
  return (
    <Section title="Services">
      {servicesField && <p className="text-sm leading-relaxed text-accent/85">{servicesField}</p>}
      {offerings.length > 0 && (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {offerings.map((o) => (
            <li key={o.id}>
              <ObjectPreview object={o} linked />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function PeopleSection({ node }: { node: NodePayload }) {
  const people = node.related.filter((o) =>
    ["ping.social.person@1", "ping.social.profile@1"].includes(o.schema),
  );
  const hasController = node.controller && !node.object.controllerId.startsWith("web:");
  if (people.length === 0 && !hasController) return null;
  return (
    <Section title="People">
      <div className="grid gap-3 sm:grid-cols-2">
        {hasController && node.controller && <IntelligentCircle identityId={node.controller.id} />}
        {people.map((o) => (
          <ObjectPreview key={o.id} object={o} linked />
        ))}
      </div>
    </Section>
  );
}

function ContentSection({ node }: { node: NodePayload }) {
  const content = node.related.filter((o) =>
    ["ping.social.article@1", "ping.social.post@1", "ping.social.project@1"].includes(o.schema),
  );
  if (content.length === 0) return null;
  return (
    <Section title="Content">
      <div className="grid gap-3">
        {content.map((o) => (
          <ObjectPreview key={o.id} object={o} linked />
        ))}
      </div>
    </Section>
  );
}

function SocialClaimsSection({ node }: { node: NodePayload }) {
  const { object, controller } = node;
  const verified = fieldOf(object, "verified");
  const followers = fieldOf(object, "followerCount", "followers");
  if (!verified && !followers && !controller) return null;
  return (
    <Section title="Social claims">
      <ul className="space-y-2 text-sm text-accent/80">
        {verified && (
          <li className="flex items-center gap-2">
            <BadgeCheck className="h-4 w-4 text-forest" aria-hidden="true" />
            Carries an explicit verified mark.
          </li>
        )}
        {followers && <li>Follower count on record: {followers}.</li>}
        {controller && (
          <li>
            Controlled by {controller.displayName} (@{controller.handle}).
          </li>
        )}
      </ul>
      <p className="mt-2 text-xs text-accent/50">
        Claims are badges from canonical evidence, not endorsements.
      </p>
    </Section>
  );
}

function RelationshipsSection({ node }: { node: NodePayload }) {
  const active = node.relationships.filter((r) => r.status === "active");
  if (active.length === 0) return null;
  const byPredicate = new Map<string, PingRelationship[]>();
  for (const r of active) {
    const list = byPredicate.get(r.predicate) ?? [];
    list.push(r);
    byPredicate.set(r.predicate, list);
  }
  return (
    <Section title="Relationships">
      <div className="space-y-3">
        {[...byPredicate.entries()].map(([predicate, rels]) => (
          <div key={predicate}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-accent/50">{predicate}</h3>
            <ul className="mt-1.5 space-y-1">
              {rels.slice(0, 10).map((r) => {
                const otherId = r.subject === node.object.id ? r.object : r.subject;
                return (
                  <li key={r.id} className="text-sm">
                    <Link
                      href={`/node/${encodeURIComponent(otherId)}`}
                      className="text-ping-violet hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ping-violet"
                    >
                      <code className="rounded bg-surface-2 px-1 font-mono text-xs">{otherId.slice(0, 16)}</code>
                    </Link>
                    <span className="ml-2 text-xs text-accent/50">
                      {r.status === "active" ? "active" : "inactive"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

function RelatedObjectsSection({ node, exclude }: { node: NodePayload; exclude?: Set<string> }) {
  const shown = node.related.filter((o) => !exclude?.has(o.schema));
  if (shown.length === 0) return null;
  return (
    <Section title="Related objects">
      <div className="grid gap-3 sm:grid-cols-2">
        {shown.map((o) => (
          <ObjectPreview key={o.id} object={o} linked />
        ))}
      </div>
    </Section>
  );
}

function MetadataSection({ node }: { node: NodePayload }) {
  const { object } = node;
  return (
    <Section title="Metadata">
      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-accent/50">Schema</dt>
          <dd className="mt-0.5 break-all text-accent/90">{object.schema}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-accent/50">Object id</dt>
          <dd className="mt-0.5 break-all font-mono text-xs text-accent/90">{object.id}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-accent/50">Provenance</dt>
          <dd className="mt-0.5 text-accent/90">
            {object.provenance.kind === "website-derived"
              ? `Website projection (${object.provenance.ref})`
              : `Canonical journal (event ${object.provenance.ref.slice(0, 16)})`}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-accent/50">Updated</dt>
          <dd className="mt-0.5 text-accent/90">{object.updatedAt}</dd>
        </div>
      </dl>
      {Object.keys(object.fields).length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-accent/60 hover:text-accent">All public fields</summary>
          <dl className="mt-2 space-y-1.5">
            {Object.entries(object.fields).map(([k, v]) => (
              <div key={k} className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-accent/60">{k}:</dt>
                <dd className="break-words text-accent/90">{Array.isArray(v) ? v.join(", ") : v}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </Section>
  );
}

function AskSection({ node, onChanged, askPrefill }: { node: NodePayload; onChanged: () => void; askPrefill?: string | null }) {
  return <AskPingPanel targetObjectId={node.object.id} initialPrefill={askPrefill ?? null} onChanged={onChanged} />;
}

function BusinessNodeSections({ node, onAsk, onChanged, askPrefill }: NodeSectionProps) {
  void onAsk;
  const consumed = new Set(["ping.social.service@1", "ping.social.product@1", "ping.social.offer@1",
    "ping.social.person@1", "ping.social.profile@1",
    "ping.social.article@1", "ping.social.post@1", "ping.social.project@1"]);
  return (
    <div className="space-y-4">
      <HeroSection node={node} />
      <DescriptionSection node={node} />
      <ServicesSection node={node} />
      <PeopleSection node={node} />
      <ContentSection node={node} />
      <SocialClaimsSection node={node} />
      <RelatedObjectsSection node={node} exclude={consumed} />
      <AskSection node={node} onChanged={onChanged} askPrefill={askPrefill} />
    </div>
  );
}

function PersonNodeSections({ node, onAsk, onChanged, askPrefill }: NodeSectionProps) {
  void onAsk;
  const posts = node.related.filter((o) => o.schema === "ping.social.post@1");
  const projects = node.related.filter((o) => o.schema === "ping.social.project@1");
  const rest = new Set(["ping.social.post@1", "ping.social.project@1"]);
  const location = fieldOf(node.object, "location", "city");
  const isPublicLocation = node.object.visibility === "public";
  return (
    <div className="space-y-4">
      <HeroSection node={node} />
      <DescriptionSection node={node} />
      {isPublicLocation && location && (
        <Section title="Location">
          <p className="text-sm text-accent/85">{location}</p>
        </Section>
      )}
      {projects.length > 0 && (
        <Section title="Projects">
          <div className="grid gap-3 sm:grid-cols-2">
            {projects.map((o) => (
              <ObjectPreview key={o.id} object={o} linked />
            ))}
          </div>
        </Section>
      )}
      {posts.length > 0 && (
        <Section title="Posts">
          <div className="grid gap-3">
            {posts.map((o) => (
              <ObjectPreview key={o.id} object={o} linked />
            ))}
          </div>
        </Section>
      )}
      <RelationshipsSection node={node} />
      <SocialClaimsSection node={node} />
      <RelatedObjectsSection node={node} exclude={rest} />
      <AskSection node={node} onChanged={onChanged} askPrefill={askPrefill} />
    </div>
  );
}

function GenericNodeSections({ node, onAsk, onChanged, askPrefill }: NodeSectionProps) {
  void onAsk;
  return (
    <div className="space-y-4">
      <HeroSection node={node} />
      <DescriptionSection node={node} />
      <MetadataSection node={node} />
      <RelationshipsSection node={node} />
      <RelatedObjectsSection node={node} />
      <AskSection node={node} onChanged={onChanged} askPrefill={askPrefill} />
    </div>
  );
}

/** Renderer registry: schema -> section renderer. Unknown schemas fall back to generic. */
export const NODE_RENDERERS: Record<string, React.ComponentType<NodeSectionProps>> = {
  "ping.social.business@1": BusinessNodeSections,
  "ping.social.profile@1": PersonNodeSections,
  "ping.social.person@1": PersonNodeSections,
};

export function NodeSections({ node, onAsk, onChanged, askPrefill }: NodeSectionProps) {
  const Renderer = NODE_RENDERERS[node.object.schema] ?? GenericNodeSections;
  return <Renderer node={node} onAsk={onAsk} onChanged={onChanged} askPrefill={askPrefill} />;
}
