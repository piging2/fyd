/**
 * Semantic canonicalization for SiteSpecs.
 *
 * The semantic render model is the spec minus volatile stamps: the same
 * (ObjectGraph, OwnerIntent, vector, planner version, design tokens,
 * viewer class) must yield the same semantic render model, byte for byte.
 * canonicalizeSpec strips generatedAt (and any *At timestamp), sorts
 * object keys recursively, and serializes deterministically. Array order
 * is semantic (section order matters) and is preserved.
 *
 * Law: no timestamps in semantic planning. A spec planned twice with
 * different generatedAt values MUST produce the same semantic digest.
 */

import { createHash } from "node:crypto";
import type { FYDSiteSpec } from "../sitespec/types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function stripVolatile(key: string): boolean {
  return (
    key === "generatedAt" ||
    key === "dumpedAt" ||
    key === "manifestGeneratedAt" ||
    key.endsWith("At")
  );
}

function canonicalizeValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonicalizeValue);
  if (!isRecord(v)) return v;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(v).sort()) {
    if (stripVolatile(key)) continue;
    out[key] = canonicalizeValue(v[key]);
  }
  return out;
}

/** Canonical JSON of a spec: sorted keys, no volatile stamps. */
export function canonicalizeSpec(spec: FYDSiteSpec): string {
  return JSON.stringify(canonicalizeValue(spec));
}

/** sha256 hex over the canonical spec: the semantic identity. */
export function semanticDigestOf(spec: FYDSiteSpec): string {
  return createHash("sha256").update(canonicalizeSpec(spec), "utf8").digest("hex");
}
