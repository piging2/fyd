/**
 * LANE-OWNER: the conversational command compiler.
 *
 * Plain English -> OwnerIntent (typed, deterministic) -> OwnerProposal
 * (drafted by ./owner-proposal.ts). The compiler never touches the DOM,
 * the spec, or the facts: it produces typed intents. Preview, approval,
 * apply, and replay all happen downstream on the proposal.
 *
 * Supported commands (anything else is an honest Unsupported, never a
 * guess):
 *
 *   "Put emergency service first."       -> promote_first     (SiteSpec)
 *   "Hide the team section."             -> hide_section      (SiteSpec)
 *   "Feature commercial work."           -> feature_object    (SiteSpec)
 *   "Feature Alice."                     -> feature_object    (SiteSpec)
 *   "Make the phone action more prominent." -> promote_action (SiteSpec)
 *   "Show both locations."               -> show_locations    (visibility)
 *   "Don't show my street address."      -> hide_fact         (visibility)
 *   "Show my street address."            -> show_fact         (visibility)
 *   "Remove this social link."           -> remove_social_link (correction)
 *
 * The four classic kinds delegate to the existing Lane D parser and
 * resolver (./intent.ts): same text in, same typed intent out. The five
 * new kinds are compiled here. Determinism: keyword-anchored matchers
 * over normalized text; the same text always yields the same intent.
 *
 * Pure, deterministic, browser-safe.
 */

import { parseCustomizationIntent } from "./intent";
import { isUnsupported, type ParsedIntent } from "./types";
import { resolveQuery } from "../components/renderer";
import type { SiteFact } from "../owner-mode/facts";
import type { FYDSiteSpec, ObjectGraph } from "../sitespec/types";

/**
 * The typed owner intent. The four classic kinds reuse the Lane D intent
 * shapes exactly; the five new kinds extend the vocabulary to visibility
 * and fact corrections.
 */
export type OwnerIntent =
  | { kind: "promote_first"; target: string }
  | { kind: "hide_section"; target: string }
  | { kind: "show_section"; target: string }
  | { kind: "feature_object"; target: string }
  | { kind: "promote_action"; target: string }
  | { kind: "show_locations" }
  | { kind: "hide_fact"; target: string }
  | { kind: "show_fact"; target: string }
  | {
      kind: "remove_social_link";
      target: string;
      /** True when the command said "this" (deictic, binds to context). */
      deictic: boolean;
    };

export type OwnerIntentKind = OwnerIntent["kind"];

export type CompileOutcome =
  | { ok: true; intent: OwnerIntent }
  | { ok: false; reason: string };

const SUPPORTED_SUMMARY =
  "I can: put a named section first, hide or show a named section, " +
  "feature a named object or person, make a contact action more prominent, " +
  "show locations, show or hide one of your facts (like your street " +
  "address), and remove a social link.";

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[?!.,;:]+$/g, "")
    .trim();
}

function cleanTarget(raw: string): string {
  return raw
    .replace(/\b(my|the|our|this|that|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[?!.,;:]+$/g, "")
    .trim();
}

function unsupported(text: string, normalized: string): CompileOutcome {
  return {
    ok: false,
    reason:
      'I do not support "' +
      text.trim().slice(0, 120) +
      '" as an owner command. ' +
      SUPPORTED_SUMMARY,
  };
}

/** Normalize for field matching: lowercase, underscores to spaces. */
export function normalizeFieldName(field: string): string {
  return field.toLowerCase().replace(/_/g, " ").trim();
}

/**
 * Resolve a spoken fact name ("street address") to one extracted fact.
 * Exact normalized-field match wins; otherwise a unique containment
 * match wins. When several objects share the field name and a preferred
 * object is given (the owner's own object for "my X" phrasing), that
 * object's fact wins; otherwise the name is ambiguous and the caller
 * reports the honest reason, never a guess.
 */
export function resolveNamedFact(
  facts: SiteFact[],
  target: string,
  preferredObjectId?: string,
): { fact: SiteFact } | { fact: null; candidates: SiteFact[] } {
  const t = normalizeFieldName(target);
  if (!t) return { fact: null, candidates: [] };
  const pick = (
    pool: SiteFact[],
  ): { fact: SiteFact } | { fact: null; candidates: SiteFact[] } => {
    if (pool.length === 1) return { fact: pool[0] };
    if (pool.length > 1 && preferredObjectId) {
      const preferred = pool.filter((f) => f.objectId === preferredObjectId);
      if (preferred.length === 1) return { fact: preferred[0] };
    }
    return { fact: null, candidates: pool };
  };
  const exact = facts.filter((f) => normalizeFieldName(f.field) === t);
  if (exact.length > 0) return pick(exact);
  const contained = facts.filter((f) => {
    const fn = normalizeFieldName(f.field);
    return fn.includes(t) || t.includes(fn);
  });
  return pick(contained);
}

/** First section (spec order) whose resolved objects include objectId. */
export function sectionContainingObject(
  spec: FYDSiteSpec,
  graph: ObjectGraph,
  objectId: string,
): { pageSlug: string; sectionId: string; component: string } | null {
  for (const page of spec.pages) {
    for (const s of page.sections) {
      const ids = resolveQuery(s.query, graph, spec.ownerObjectId).map(
        (o) => o.id,
      );
      if (ids.includes(objectId)) {
        return { pageSlug: page.slug, sectionId: s.id, component: s.component };
      }
    }
  }
  return null;
}

/**
 * Compile plain English into a typed OwnerIntent. The five new command
 * shapes are matched first (in the order below); everything else falls
 * through to the Lane D parser for the four classic kinds.
 */
export function compileOwnerCommand(text: string): CompileOutcome {
  const normalized = normalizeText(text);
  if (!normalized) {
    return { ok: false, reason: "Empty command. " + SUPPORTED_SUMMARY };
  }

  // "Make the phone action more prominent."
  let m = normalized.match(
    /\bmake\b\s+(?:the\s+)?(.+?)\s+action\s+more\s+prominent\b/,
  );
  if (m) {
    const target = cleanTarget(m[1]);
    if (target) return { ok: true, intent: { kind: "promote_action", target } };
  }

  // "Show both locations."
  if (/\bshow\b\s+both\s+locations\b/.test(normalized)) {
    return { ok: true, intent: { kind: "show_locations" } };
  }

  // "Remove this social link." / "Remove the facebook link."
  m = normalized.match(/\bremove\b\s+(?:this\s+)?(.+?)(?:\s+link)?$/);
  if (m) {
    const deictic = /\bremove\b\s+this\b/.test(normalized);
    const target = cleanTarget(m[1]);
    if (target && /(social|link)/.test(target)) {
      return { ok: true, intent: { kind: "remove_social_link", target, deictic } };
    }
    // Not a social-link removal; fall through to the classic parser.
  }

  // "Don't show my street address." / "Do not show my street address."
  // ("my" signals a fact, not a section; a trailing "section" word means
  // the classic section parser owns it.)
  m = normalized.match(/\bdo(?:n't| not)\s+show\s+(?:my\s+|the\s+)?(.+)/);
  if (m) {
    const target = cleanTarget(m[1]);
    if (target && !/\bsection$/.test(target)) {
      return { ok: true, intent: { kind: "hide_fact", target } };
    }
    // Falls through to the classic hide_section parser below.
  }

  // "Show my street address." ("my" signals a fact-level show.)
  m = normalized.match(/\bshow\b\s+my\s+(.+)/);
  if (m) {
    const target = cleanTarget(m[1]);
    if (target) return { ok: true, intent: { kind: "show_fact", target } };
  }

  // The four classic kinds, via the Lane D parser (same text in, same
  // typed intent out; unsupported text stays unsupported).
  const parsed = parseCustomizationIntent(text);
  if (isUnsupported(parsed)) {
    return unsupported(text, normalized);
  }
  const classic = parsed.intent as ParsedIntent;
  switch (classic.kind) {
    case "promote_first":
      return { ok: true, intent: { kind: "promote_first", target: classic.target } };
    case "hide_section":
      return { ok: true, intent: { kind: "hide_section", target: classic.target } };
    case "show_section":
      return { ok: true, intent: { kind: "show_section", target: classic.target } };
    case "feature_object":
      return { ok: true, intent: { kind: "feature_object", target: classic.target } };
  }
}

/** Re-export for the proposal layer: classic intents are ParsedIntents. */
export function classicIntentOf(intent: OwnerIntent): ParsedIntent | null {
  switch (intent.kind) {
    case "promote_first":
      return { kind: "promote_first", target: intent.target };
    case "hide_section":
      return { kind: "hide_section", target: intent.target };
    case "show_section":
      return { kind: "show_section", target: intent.target };
    case "feature_object":
      return { kind: "feature_object", target: intent.target };
    default:
      return null;
  }
}
