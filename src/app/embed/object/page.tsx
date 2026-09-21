"use client";

import * as React from "react";
import type { CapabilityPlan, PingObject } from "@/lib/ping/types";
import { ObjectPreview } from "@/components/ping/object-preview";

/**
 * Minimal embed: a chromeless object preview for third-party pages.
 * Server-fetches the object and its capability plan, then renders the
 * same ObjectPreview used natively. No credentials, no journal data.
 */
export default function EmbedObjectPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const [object, setObject] = React.useState<PingObject | null>(null);
  const [plan, setPlan] = React.useState<CapabilityPlan | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const { id } = await searchParams;
      if (!id) {
        if (!cancelled) setError("Missing object id.");
        return;
      }
      try {
        const res = await fetch(`/api/ping/node?id=${encodeURIComponent(id)}`);
        const json: unknown = await res.json().catch(() => null);
        if (!res.ok) throw new Error("Object unavailable.");
        const node = (json as { node?: { object: PingObject; plan: CapabilityPlan } }).node;
        if (!node) throw new Error("Object unavailable.");
        if (!cancelled) {
          setObject(node.object);
          setPlan(node.plan);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Object unavailable.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  if (error) {
    return (
      <div className="p-4 text-sm text-accent/60" role="alert">
        {error}
      </div>
    );
  }
  if (!object) {
    return (
      <div className="p-4" aria-label="Loading">
        <div className="h-24 animate-pulse rounded-xl bg-surface-2" />
      </div>
    );
  }
  return (
    <div className="p-2">
      <ObjectPreview object={object} plan={plan} linked={false} />
      <p className="mt-2 text-center text-xs text-accent/40">
        Powered by PING.{" "}
        <a
          href={`/node/${encodeURIComponent(object.id)}`}
          target="_blank"
          rel="noreferrer"
          className="text-ping-violet hover:underline"
        >
          Open full Node
        </a>
      </p>
    </div>
  );
}
