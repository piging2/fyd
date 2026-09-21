/**
 * Exact and ambiguous matchers (spike-1). Pure, deterministic.
 *
 * EXACT tier: three rules, evaluated in order url -> phone -> name+address.
 * Every rule requires both sides present and non-empty after normalization.
 * Name alone, name+city, or name+trade never exact-match: those are the
 * ambiguous tier's job.
 *
 * AMBIGUOUS tier: weighted feature score in [0,1]. A pair becomes a
 * CANDIDATE at score >= AMBIGUOUS_THRESHOLD. Candidates are isolated for
 * intelligence review and are never auto-merged (enforced in resolve.ts:
 * the AmbiguousDecision type has no matchedIds field at all).
 */

import type { ExactRule, ResolveEntity } from "./types.ts";
import {
  normalizeAddress,
  normalizeCity,
  normalizeName,
  normalizePhone,
  normalizeUrl,
  phoneArea,
  urlHost,
} from "./normalize.ts";

export const AMBIGUOUS_THRESHOLD = 0.5;

/** Rule probes. Return the normalized evidence string on match, "" otherwise. */
export function exactUrl(a: ResolveEntity, b: ResolveEntity): string {
  const x = normalizeUrl(a.url);
  const y = normalizeUrl(b.url);
  return x && y && x === y ? x : "";
}

export function exactPhone(a: ResolveEntity, b: ResolveEntity): string {
  const x = normalizePhone(a.phone);
  const y = normalizePhone(b.phone);
  return x && y && x === y ? x : "";
}

export function exactNameAddress(a: ResolveEntity, b: ResolveEntity): string {
  const nx = normalizeName(a.name);
  const ny = normalizeName(b.name);
  const ax = normalizeAddress(a.address);
  const ay = normalizeAddress(b.address);
  return nx && ny && nx === ny && ax && ay && ax === ay ? `${nx} @ ${ax}` : "";
}

const EXACT_RULES: Array<{ rule: ExactRule; probe: (a: ResolveEntity, b: ResolveEntity) => string }> = [
  { rule: "exact-url", probe: exactUrl },
  { rule: "exact-phone", probe: exactPhone },
  { rule: "exact-name-address", probe: exactNameAddress },
];

export function exactRuleFor(a: ResolveEntity, b: ResolveEntity): { rule: ExactRule; evidence: string } | null {
  for (const { rule, probe } of EXACT_RULES) {
    const evidence = probe(a, b);
    if (evidence) return { rule, evidence };
  }
  return null;
}

/** Classic iterative Levenshtein, two rows, O(min(m,n)) space. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

function levRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function tokenJaccard(a: string, b: string): number {
  const sa = new Set(a.split(" ").filter(Boolean));
  const sb = new Set(b.split(" ").filter(Boolean));
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

/** 0.6 token Jaccard + 0.4 character-level ratio, on normalized names. */
export function nameSimilarity(a: ResolveEntity, b: ResolveEntity): number {
  const x = normalizeName(a.name);
  const y = normalizeName(b.name);
  if (!x || !y) return 0;
  return 0.6 * tokenJaccard(x, y) + 0.4 * levRatio(x, y);
}

export interface PairFeatures {
  nameSim: number;
  sameCity: boolean;
  sameUrlHost: boolean;
  phoneAreaMatch: boolean;
  tradeOverlap: boolean;
}

export function pairFeatures(a: ResolveEntity, b: ResolveEntity): PairFeatures {
  const hx = urlHost(a.url);
  const hy = urlHost(b.url);
  const px = phoneArea(a.phone);
  const py = phoneArea(b.phone);
  const tx = new Set(normalizeName(a.trade).split(" ").filter(Boolean));
  const ty = new Set(normalizeName(b.trade).split(" ").filter(Boolean));
  let tradeOverlap = false;
  for (const t of tx) if (ty.has(t) && t.length >= 4) { tradeOverlap = true; break; }
  return {
    nameSim: nameSimilarity(a, b),
    sameCity: !!normalizeCity(a.city) && normalizeCity(a.city) === normalizeCity(b.city),
    sameUrlHost: !!hx && hx === hy,
    phoneAreaMatch: !!px && px === py,
    tradeOverlap,
  };
}

/**
 * Weighted score in [0,1]. Weights are spike-chosen and documented, not
 * tuned: name dominates; city/host/area/trade are weak corroboration.
 */
export function pairScore(a: ResolveEntity, b: ResolveEntity): { score: number; features: PairFeatures } {
  const features = pairFeatures(a, b);
  const score =
    0.55 * features.nameSim +
    0.15 * (features.sameCity ? 1 : 0) +
    0.12 * (features.sameUrlHost ? 1 : 0) +
    0.10 * (features.phoneAreaMatch ? 1 : 0) +
    0.08 * (features.tradeOverlap ? 1 : 0);
  return { score, features };
}
