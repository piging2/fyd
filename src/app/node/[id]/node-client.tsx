"use client";

/**
 * NodeClient: client shell for the Node page. Holds Ask prefill state so
 * object action rows anywhere on the page can open Ask PING with a
 * question drafted, and refetches the Node payload after mutations.
 */

import * as React from "react";
import type { NodePayload } from "@/lib/ping/types";
import { NodeSections } from "@/components/ping/node-sections";

export function NodeClient({ node: initial }: { node: NodePayload }) {
  const [node, setNode] = React.useState<NodePayload>(initial);
  const [askPrefill, setAskPrefill] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/ping/node?id=${encodeURIComponent(initial.object.id)}`);
      const json: unknown = await res.json().catch(() => null);
      if (res.ok && (json as { node?: NodePayload }).node) {
        setNode((json as { node: NodePayload }).node);
      }
    } catch {
      /* keep stale payload */
    }
  }, [initial.object.id]);

  const handleAsk = React.useCallback((prefill: string | null) => {
    setAskPrefill(prefill);
    requestAnimationFrame(() => {
      document
        .querySelector('[aria-label="Ask PING"]')
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-8">
      <NodeSections node={node} askPrefill={askPrefill} onAsk={handleAsk} onChanged={refresh} />
    </main>
  );
}
