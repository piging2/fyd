/**
 * SOURCE REFRESH: re-ingest the source layer without touching the owner layer.
 *
 * The refresh takes the current SOURCE-layer graph and a freshly
 * re-derived SOURCE-layer graph (re-derivation of raw observations into a
 * graph happens upstream, at the projection intake seam), and returns:
 *   - source: the new SOURCE-layer graph, passed through,
 *   - ownerLayer: the OWNER layer (OwnerIntent plus per-object field
 *     corrections) carried through as a canonical deep copy, never merged
 *     into and never mutated,
 *   - ownerLayerDigestBefore / ownerLayerDigestAfter: sha256 digests over
 *     the canonicalized owner layer. Equality is the machine-checkable
 *     proof that the refresh did not erase or alter owner intent.
 *   - diff: the semantic diff over the source change, computed WITH the
 *     owner layer in context, so collisions surface as conflicts instead
 *     of being silently applied.
 *
 * Four non-overwriting layers, restated as the refresh contract:
 *   SOURCE is replaced wholesale by the re-derived graph. OWNER is
 *   byte-stable across the refresh (proven by digest). GENERATED and
 *   PROJECTION are downstream: they consume diff.actions after the object
 *   builder re-attests the new source (reverify-graph sorts first).
 *
 * When the refreshed source drops a fact the owner overrode (object or
 * field gone), the owner correction is RETAINED in the owner layer and the
 * diff flags an owner-override-collision: the owner still wins, the drift
 * is visible.
 */

import { createHash } from "node:crypto";
import type { ObjectGraph } from "../sitespec/types";
import type { DependencyManifest } from "./manifest";
import { normalizeOwnerIntent, type OwnerIntent } from "./owner-intent";
import {
  diffTwin,
  type OwnerAssertion,
  type SemanticDiff,
} from "./semantic-diff";

export const SOURCE_REFRESH_VERSION = "fyd-source-refresh@1";

/**
 * The OWNER layer: durable owner state. The refresh reads it for conflict
 * detection and carries it through untouched. It is never merged with
 * source data and never written by the refresh.
 */
export interface OwnerLayer {
  intent: OwnerIntent;
  assertions: OwnerAssertion[];
}

export interface SourceRefreshInput {
  tenantId: string;
  /** Current SOURCE-layer graph (before refresh). */
  currentSource: ObjectGraph;
  /** Freshly re-derived SOURCE-layer graph (after refresh). */
  refreshedSource: ObjectGraph;
  /** The OWNER layer. Carried through, never mutated. */
  ownerLayer: OwnerLayer;
  /** Dependency manifest of the current projection. */
  manifest: DependencyManifest;
}

export interface SourceRefreshResult {
  version: typeof SOURCE_REFRESH_VERSION;
  tenantId: string;
  /** The new SOURCE-layer graph. */
  source: ObjectGraph;
  /** The OWNER layer, carried through as a canonical deep copy. */
  ownerLayer: OwnerLayer;
  /** sha256 over the canonical owner layer, before the refresh. */
  ownerLayerDigestBefore: string;
  /** sha256 over the canonical owner layer, after the refresh. */
  ownerLayerDigestAfter: string;
  /** True exactly when the two digests match: the survival proof. */
  ownerLayerIntact: boolean;
  /** Semantic diff of the source change, with owner conflicts. */
  diff: SemanticDiff;
}

function canonicalizeValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicalizeValue);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = canonicalizeValue((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

/**
 * Canonical owner-layer bytes: sorted keys throughout, assertions in
 * (objectId, field) order so assertion input order never affects the
 * digest. Deterministic across runs and machines.
 */
function canonicalOwnerLayer(layer: OwnerLayer): string {
  const assertions = [...layer.assertions].sort((a, b) =>
    a.objectId < b.objectId ? -1 : a.objectId > b.objectId ? 1 :
    a.correction.field < b.correction.field ? -1 :
    a.correction.field > b.correction.field ? 1 : 0,
  );
  return JSON.stringify(canonicalizeValue({ intent: layer.intent, assertions }));
}

/** sha256 hex over the canonical owner layer. Exported for test assertions. */
export function digestOwnerLayer(layer: OwnerLayer): string {
  return createHash("sha256").update(canonicalOwnerLayer(layer), "utf8").digest("hex");
}

/**
 * Run one source refresh. Pure: never mutates its input, never writes the
 * owner layer, never touches GENERATED or PROJECTION state. The returned
 * ownerLayer is a canonical deep copy of the input owner layer with
 * identical content and no shared references.
 */
export function refreshSource(input: SourceRefreshInput): SourceRefreshResult {
  const intent = normalizeOwnerIntent(input.ownerLayer.intent);
  const normalized: OwnerLayer = {
    intent,
    assertions: input.ownerLayer.assertions.map((a) => ({
      objectId: a.objectId,
      correction: { ...a.correction },
    })),
  };
  const before = digestOwnerLayer(normalized);

  const diff = diffTwin({
    tenantId: input.tenantId,
    oldGraph: input.currentSource,
    newGraph: input.refreshedSource,
    manifest: input.manifest,
    intent,
    ownerAssertions: normalized.assertions,
  });

  // Canonical deep copy: equal content, no shared references with the
  // caller objects. Input order of assertions is preserved in the copy;
  // the digest canonical form sorts, so order never affects the proof.
  const carried: OwnerLayer = JSON.parse(JSON.stringify(normalized)) as OwnerLayer;
  const after = digestOwnerLayer(carried);

  return {
    version: SOURCE_REFRESH_VERSION,
    tenantId: input.tenantId,
    source: input.refreshedSource,
    ownerLayer: carried,
    ownerLayerDigestBefore: before,
    ownerLayerDigestAfter: after,
    ownerLayerIntact: before === after,
    diff,
  };
}
