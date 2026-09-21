"use client";

/**
 * FeedClient: discovery feed. Every item is tappable (links to its Node),
 * referenceable (copy link action), and Ask-PING-able (action row ask).
 * An Ask PING panel sits at the bottom; object action rows prefill it.
 */

import * as React from "react";
import type { CapabilityPlan, DiscoveryFeedItem } from "@/lib/ping/types";
import { AskPingPanel } from "@/components/ping/ask-ping";
import { ObjectPreview } from "@/components/ping/object-preview";

export interface FeedItemWithPlan extends DiscoveryFeedItem {
  plan: CapabilityPlan | null;
}

const KIND_LABELS: Record<string, string> = {
  object_activity: "Recent activity",
  new_public_object: "New public object",
  relationship_change: "Relationship update",
  website_content: "From the website",
};

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind.replace(/_/g, " ");
}

export function FeedClient({ initialItems }: { initialItems: FeedItemWithPlan[] }) {
  const [askPrefill, setAskPrefill] = React.useState<string | null>(null);
  const [askTarget, setAskTarget] = React.useState<string | null>(null);

  const handleAsk = React.useCallback((prefill: string | null, objectId: string | null) => {
    setAskPrefill(prefill);
    setAskTarget(objectId);
    requestAnimationFrame(() => {
      document
        .querySelector('[aria-label="Ask PING"]')
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-8">
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-accent">Discovery</h1>
        <p className="mt-1 text-sm text-accent/60">
          Deterministically ranked from PING objects, relationships, and website content.
        </p>
      </header>

      {initialItems.length === 0 ? (
        <p className="rounded-xl border border-border/40 bg-surface p-6 text-sm text-accent/60">
          Nothing in the feed yet. Objects and relationships you can see will appear here.
        </p>
      ) : (
        <div className="space-y-4">
          {initialItems.map((item) => (
            <div key={`${item.kind}:${item.object.id}:${item.eventTime}`}>
              <p className="mb-1.5 flex flex-wrap items-center gap-x-2 text-xs text-accent/50">
                <span className="font-semibold uppercase tracking-wide">{kindLabel(item.kind)}</span>
                {item.actorDisplayName && <span>by {item.actorDisplayName}</span>}
                <time dateTime={item.eventTime}>
                  {new Date(item.eventTime).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
              </p>
              <ObjectPreview
                object={item.object}
                plan={item.plan}
                onAsk={handleAsk}
                linked
              />
            </div>
          ))}
        </div>
      )}

      <div className="mt-8">
        <AskPingPanel initialPrefill={askPrefill} targetObjectId={askTarget} />
      </div>
    </main>
  );
}
