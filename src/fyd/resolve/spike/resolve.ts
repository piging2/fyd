/**
 * Resolution orchestrator (spike-1).
 *
 * resolveCandidate(candidate, corpus): deterministic, pure.
 *
 * 1. EXACT tier: probe the three exact rules against an index keyed on
 *    normalized URL, normalized phone, and normalized name+address.
 *    Index probes are O(1); no intelligence is spent here.
 * 2. AMBIGUOUS tier: block the corpus (shared city, shared URL host,
 *    shared phone area+exchange, or a shared name token of length >= 4),
 *    score only blocked pairs, keep score >= threshold as CANDIDATES.
 *    Never merged: the AmbiguousDecision carries no matchedIds.
 * 3. UNMATCHED: reported honestly when nothing fires.
 *
 * Determinism: exact matches sorted ascending by id; candidates sorted by
 * score desc then id asc. evaluatedAt is injectable; tests pin it.
 */

import type {
  AmbiguousCandidate,
  Provenance,
  ResolveEntity,
  ResolutionDecision,
} from "./types.ts";
import { NORMALIZER_VERSION } from "./types.ts";
import {
  normalizeAddress,
  normalizeCity,
  normalizeName,
  normalizePhone,
  normalizeUrl,
  nameTokens,
  phoneArea,
  urlHost,
} from "./normalize.ts";
import { AMBIGUOUS_THRESHOLD, exactRuleFor, pairScore } from "./matchers.ts";

export const DEFAULT_EVALUATED_AT = "2026-09-21T00:00:00.000Z";

interface Index {
  byUrl: Map<string, ResolveEntity[]>;
  byPhone: Map<string, ResolveEntity[]>;
  byNameAddress: Map<string, ResolveEntity[]>;
  /** Block keys for the ambiguous tier. */
  blocks: Map<string, ResolveEntity[]>;
}

function addTo(map: Map<string, ResolveEntity[]>, key: string, e: ResolveEntity): void {
  if (!key) return;
  const list = map.get(key);
  if (list) list.push(e);
  else map.set(key, [e]);
}

export function buildIndex(corpus: ResolveEntity[]): Index {
  const index: Index = {
    byUrl: new Map(),
    byPhone: new Map(),
    byNameAddress: new Map(),
    blocks: new Map(),
  };
  for (const e of corpus) {
    addTo(index.byUrl, normalizeUrl(e.url), e);
    addTo(index.byPhone, normalizePhone(e.phone), e);
    const na = normalizeName(e.name);
    const ad = normalizeAddress(e.address);
    if (na && ad) addTo(index.byNameAddress, `${na}\u0000${ad}`, e);
    const cityKey = normalizeCity(e.city);
    if (cityKey) addTo(index.blocks, "city:" + cityKey, e);
    const hostKey = urlHost(e.url);
    if (hostKey) addTo(index.blocks, "host:" + hostKey, e);
    const areaKey = phoneArea(e.phone);
    if (areaKey) addTo(index.blocks, "area:" + areaKey, e);
    for (const t of nameTokens(e.name)) {
      if (t.length >= 4) addTo(index.blocks, "tok:" + t, e);
    }
  }
  return index;
}

function provenanceFor(candidateId: string, corpusRef: string, mechanism: string, evaluatedAt: string): Provenance {
  return { candidateId, corpusRef, mechanism, evaluatedAt, normalizerVersion: NORMALIZER_VERSION };
}

export interface ResolveOptions {
  corpusRef: string;
  evaluatedAt?: string;
  threshold?: number;
  maxCandidates?: number;
}

export function resolveCandidate(
  candidate: ResolveEntity,
  corpus: ResolveEntity[],
  index: Index,
  options: ResolveOptions,
): ResolutionDecision {
  const evaluatedAt = options.evaluatedAt ?? DEFAULT_EVALUATED_AT;
  const threshold = options.threshold ?? AMBIGUOUS_THRESHOLD;
  const maxCandidates = options.maxCandidates ?? 5;

  // Tier 1: EXACT. Probe indexes; verify with the rule (index key equality
  // is necessary but the rule is the authority, so re-verify per pair).
  const exactHits = new Map<string, { rule: "exact-url" | "exact-phone" | "exact-name-address"; evidence: string }>();
  const probeKeys: Array<{ map: Map<string, ResolveEntity[]>; key: string }> = [
    { map: index.byUrl, key: normalizeUrl(candidate.url) },
    { map: index.byPhone, key: normalizePhone(candidate.phone) },
    {
      map: index.byNameAddress,
      key: (() => {
        const na = normalizeName(candidate.name);
        const ad = normalizeAddress(candidate.address);
        return na && ad ? `${na}\u0000${ad}` : "";
      })(),
    },
  ];
  for (const { map, key } of probeKeys) {
    if (!key) continue;
    for (const member of map.get(key) ?? []) {
      if (member.id === candidate.id) continue;
      const hit = exactRuleFor(candidate, member);
      if (hit && !exactHits.has(member.id)) exactHits.set(member.id, hit);
    }
  }
  if (exactHits.size > 0) {
    const matchedIds = [...exactHits.keys()].sort();
    const first = exactHits.get(matchedIds[0])!;
    const evidence: Record<string, string> = {};
    for (const id of matchedIds) {
      const h = exactHits.get(id)!;
      evidence[h.rule] = h.evidence;
    }
    return {
      tier: "EXACT",
      rule: first.rule,
      matchedIds,
      evidence,
      provenance: provenanceFor(candidate.id, options.corpusRef, `rule:${first.rule}`, evaluatedAt),
    };
  }

  // Tier 2: AMBIGUOUS. Block, score, isolate. Never merge.
  const blocked = new Set<ResolveEntity>();
  const cityKey = normalizeCity(candidate.city);
  const hostKey = urlHost(candidate.url);
  const areaKey = phoneArea(candidate.phone);
  const blockKeys: string[] = [
    ...(cityKey ? ["city:" + cityKey] : []),
    ...(hostKey ? ["host:" + hostKey] : []),
    ...(areaKey ? ["area:" + areaKey] : []),
    ...nameTokens(candidate.name).filter((t) => t.length >= 4).map((t) => "tok:" + t),
  ];
  for (const k of blockKeys) {
    for (const member of index.blocks.get(k) ?? []) {
      if (member.id !== candidate.id) blocked.add(member);
    }
  }
  const scored: AmbiguousCandidate[] = [];
  for (const member of blocked) {
    const { score, features } = pairScore(candidate, member);
    if (score >= threshold) {
      scored.push({
        id: member.id,
        score: Math.round(score * 1000) / 1000,
        evidence: {
          name: member.name,
          nameSim: Math.round(features.nameSim * 1000) / 1000,
          sameCity: features.sameCity,
          sameUrlHost: features.sameUrlHost,
          phoneAreaMatch: features.phoneAreaMatch,
          tradeOverlap: features.tradeOverlap,
        },
      });
    }
  }
  scored.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (scored.length > 0) {
    return {
      tier: "AMBIGUOUS",
      action: "intelligence-review",
      candidates: scored.slice(0, maxCandidates),
      provenance: provenanceFor(candidate.id, options.corpusRef, "scored", evaluatedAt),
    };
  }

  // Tier 3: UNMATCHED. Honest no-match, with provenance.
  return {
    tier: "UNMATCHED",
    provenance: provenanceFor(candidate.id, options.corpusRef, "scored", evaluatedAt),
  };
}

export function resolveAll(
  candidates: ResolveEntity[],
  corpus: ResolveEntity[],
  options: ResolveOptions,
): ResolutionDecision[] {
  const index = buildIndex(corpus);
  return candidates.map((c) => resolveCandidate(c, corpus, index, options));
}

export function tierCounts(decisions: ResolutionDecision[]): { EXACT: number; AMBIGUOUS: number; UNMATCHED: number } {
  const counts = { EXACT: 0, AMBIGUOUS: 0, UNMATCHED: 0 };
  for (const d of decisions) counts[d.tier]++;
  return counts;
}
