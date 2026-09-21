"use client";

/**
 * FydCircle: the FYD-flavored Intelligent Circle. The portable doorway
 * into an FYD Node: "Ask FYD" label, FYD node href, and capability-gated
 * actions. All hover, tap/mobile bottom sheet, keyboard access, and 44px
 * target behavior is inherited from IntelligentCircle unchanged.
 */

import * as React from "react";
import { IntelligentCircle } from "@/components/ping/intelligent-circle";
import type { CapabilityPlan, IntelligentCircleData } from "@/lib/ping/types";

interface FydCircleProps {
  identityId: string;
  initialData?: IntelligentCircleData | null;
  fetchOnOpen?: boolean;
  /** Capability plan; when provided, the card renders only planned actions. */
  plan?: CapabilityPlan | null;
  /** FYD Node href for the Open action; defaults to the object node page. */
  nodeHref?: string | null;
  onAsk?: (prefill: string | null, objectId: string | null) => void;
  className?: string;
}

export function FydCircle({
  identityId,
  initialData = null,
  fetchOnOpen = true,
  plan = null,
  nodeHref = null,
  onAsk,
  className,
}: FydCircleProps) {
  return (
    <IntelligentCircle
      identityId={identityId}
      initialData={initialData}
      fetchOnOpen={fetchOnOpen}
      plan={plan}
      askLabel="Ask FYD"
      nodeHref={nodeHref}
      onAsk={onAsk}
      className={className}
    />
  );
}
