/**
 * Lane D: typed intent parsing + resolution.
 *
 * Plain English -> ParsedIntent (typed, deterministic) -> ResolveResult
 * (grounded against the site's evidence, or an honest unresolved).
 *
 * Determinism: the parser is keyword-anchored regexes over normalized
 * text. Same normalized text always yields the same ParsedIntent and the
 * same intentDigest. There is no LLM, no fuzzy matching, no guessing.
 *
 * Supported this wave (anything else is UnsupportedIntent, never silently
 * reinterpreted):
 *   "make X the first thing people see" / "put X first" /
 *   "move X to the top" / "move X first" / "lead with X"
 *                                          -> promote_first (a section when X
 *   names one; the named object moved to the top of its section otherwise)
 *   "feature X" / "highlight X" / "spotlight X" -> feature_object
 *   "hide (the) X section"                -> hide_section
 *   "hide (the) X" / "deactivate (the) X" -> hide_object, unless X names a
 *   section, in which case the section-level hide_section still wins
 *   "show (the) X (section)"              -> show_section
 *
 * Resolution binds the named target to the spec. A target that names
 * nothing in the site's evidence resolves to UnresolvedIntent with the
 * reason spelled out. The pipeline never invents a target.
 */

import { sha256Hex } from "../proceduralize/sha256";
import { applyObjectOrder, resolveQuery } from "../components/renderer";
import type { ObjectGraph, FYDSiteSpec } from "../sitespec/types";
import type {
  ParsedIntent,
  ParseResult,
  ResolveResult,
  UnsupportedIntent,
} from "./types";

const SUPPORTED_SUMMARY =
  "This wave supports: making a named section the first thing on the page, " +
  "featuring a named object, hiding/showing a named section, and " +
  "hiding (deactivating) a named object.";

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2019']/g, "'")
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

type Matcher = { re: RegExp; build: (target: string) => ParsedIntent };

const MATCHERS: Matcher[] = [
  {
    re: /\bmake\b\s+(.+?)\s+\bthe first thing\b/,
    build: (t) => ({ kind: "promote_first", target: t }),
  },
  { re: /\bput\b\s+(.+?)\s+\bfirst\b/, build: (t) => ({ kind: "promote_first", target: t }) },
  {
    re: /\bmove\b\s+(.+?)\s+\bto the top\b/,
    build: (t) => ({ kind: "promote_first", target: t }),
  },
  {
    re: /\bmove\b\s+(.+?)\s+\bfirst\b/,
    build: (t) => ({ kind: "promote_first", target: t }),
  },
  { re: /\blead with\b\s+(.+)/, build: (t) => ({ kind: "promote_first", target: t }) },
  { re: /\bfeature\b\s+(.+)/, build: (t) => ({ kind: "feature_object", target: t }) },
  { re: /\bhighlight\b\s+(.+)/, build: (t) => ({ kind: "feature_object", target: t }) },
  { re: /\bspotlight\b\s+(.+)/, build: (t) => ({ kind: "feature_object", target: t }) },
  {
    re: /\bhide\b\s+(?:the\s+)?(.+?)\s+section$/,
    build: (t) => ({ kind: "hide_section", target: t }),
  },
  {
    re: /\bdeactivate\b\s+(?:the\s+)?(.+)$/,
    build: (t) => ({ kind: "hide_object", target: t }),
  },
  {
    re: /\bhide\b\s+(?:the\s+)?(.+)$/,
    build: (t) => ({ kind: "hide_object", target: t }),
  },
  {
    re: /\bshow\b\s+(?:the\s+)?(.+?)(?:\s+section)?$/,
    build: (t) => ({ kind: "show_section", target: t }),
  },
];

function canonicalizeIntent(intent: ParsedIntent): string {
  return JSON.stringify({ kind: intent.kind, target: intent.target });
}

export function intentDigest(intent: ParsedIntent): string {
  return sha256Hex(canonicalizeIntent(intent));
}

/**
 * Parse plain English into a typed intent. Returns UnsupportedIntent when
 * the text is not a supported customization -- with the reason naming
 * what is supported, never a guess at what was meant.
 */
export function parseCustomizationIntent(text: string): ParseResult {
  const normalized = normalizeText(text);
  if (!normalized) {
    const u: UnsupportedIntent = {
      unsupported: true,
      reason: "Empty request. " + SUPPORTED_SUMMARY,
      normalizedText: normalized,
    };
    return u;
  }
  for (const m of MATCHERS) {
    const hit = normalized.match(m.re);
    if (hit) {
      const target = cleanTarget(hit[1]);
      if (!target) continue;
      const intent = m.build(target);
      return { intent, intentDigest: intentDigest(intent) };
    }
  }
  const u: UnsupportedIntent = {
    unsupported: true,
    reason:
      "I do not support \"" +
      text.trim().slice(0, 120) +
      "\" as a customization. " +
      SUPPORTED_SUMMARY,
    normalizedText: normalized,
  };
  return u;
}

// ---------------------------------------------------------------------------
// Resolution against the site's evidence.
// ---------------------------------------------------------------------------

interface SectionHit {
  pageSlug: string;
  sectionId: string;
  component: string;
}

function findSection(spec: FYDSiteSpec, target: string): SectionHit | null {
  const t = target.replace(/\s+section$/, "").trim();
  if (!t) return null;
  for (const page of spec.pages) {
    for (const s of page.sections) {
      const component = s.component.toLowerCase();
      const heading = (s.presentation.heading ?? "").toLowerCase();
      if (component === t || heading === t || s.id.toLowerCase() === t) {
        return { pageSlug: page.slug, sectionId: s.id, component: s.component };
      }
    }
  }
  return null;
}

function targetWordsMatch(title: string, target: string): boolean {
  const t = title.toLowerCase();
  if (!t || !target) return false;
  if (t.includes(target) || target.includes(t)) return true;
  const tWords = new Set(t.split(/\s+/));
  const words = target.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((w) => tWords.has(w));
}

function findObject(graph: ObjectGraph, target: string): { id: string; title: string } | null {
  const cands = graph.objects
    .filter((o) => o.title && targetWordsMatch(o.title, target))
    .sort((a, b) => a.title.length - b.title.length);
  return cands.length > 0 ? { id: cands[0].id, title: cands[0].title } : null;
}

/** First section (in spec order) whose resolved objects include objectId. */
function sectionContaining(
  spec: FYDSiteSpec,
  graph: ObjectGraph,
  objectId: string,
): SectionHit | null {
  for (const page of spec.pages) {
    for (const s of page.sections) {
      const ids = resolveQuery(s.query, graph, spec.ownerObjectId).map((o) => o.id);
      if (ids.includes(objectId)) {
        return { pageSlug: page.slug, sectionId: s.id, component: s.component };
      }
    }
  }
  return null;
}

/**
 * Ground a parsed intent against the site's evidence. A target that names
 * nothing real resolves to UnresolvedIntent -- an honest, typed failure,
 * never a reinterpretation.
 */
export function resolveCustomizationIntent(
  spec: FYDSiteSpec,
  graph: ObjectGraph,
  parsed: ParsedIntent,
): ResolveResult {
  switch (parsed.kind) {
    case "promote_first": {
      const sec = findSection(spec, parsed.target);
      if (sec) {
        return {
          resolved: true,
          parsed,
          siteIntent: {
            kind: "reorder_section",
            pageSlug: sec.pageSlug,
            sectionId: sec.sectionId,
            toIndex: 0,
          },
          resolutionNote:
            "\"" + parsed.target + "\" names the " + sec.component +
            " section; promoting it to the top of the page.",
        };
      }
      const obj = findObject(graph, parsed.target);
      if (obj) {
        const objSec = sectionContaining(spec, graph, obj.id);
        if (!objSec) {
          return {
            resolved: false,
            parsed,
            reason:
              "\"" + obj.title + "\" exists but is not shown in any " +
              "section of this site, so it cannot be moved to the top.",
          };
        }
        const section = spec.pages
          .find((p) => p.slug === objSec.pageSlug)!
          .sections.find((s) => s.id === objSec.sectionId)!;
        const current = applyObjectOrder(
          resolveQuery(section.query, graph, spec.ownerObjectId),
          section.presentation.objectOrder,
        ).map((o) => o.id);
        const after = [obj.id, ...current.filter((id) => id !== obj.id)];
        if (after.join("|") === current.join("|")) {
          return {
            resolved: false,
            parsed,
            reason:
              "\"" + obj.title + "\" is already first in the " +
              objSec.component + " section, so there is nothing to move.",
          };
        }
        return {
          resolved: true,
          parsed,
          siteIntent: {
            kind: "reorder_object",
            pageSlug: objSec.pageSlug,
            sectionId: objSec.sectionId,
            objectIds: after,
          },
          resolutionNote:
            "\"" + parsed.target + "\" is \"" + obj.title +
            "\"; moving it to the top of the " + objSec.component +
            " section.",
        };
      }
      return {
        resolved: false,
        parsed,
        reason:
          "No section or object named \"" + parsed.target + "\" exists in " +
          "this site's evidence, so there is nothing to promote. Name a " +
          "section that exists (for example \"services\").",
      };
    }
    case "feature_object": {
      const obj = findObject(graph, parsed.target);
      if (!obj) {
        return {
          resolved: false,
          parsed,
          reason:
            "No object named \"" + parsed.target + "\" exists in this " +
            "site's evidence, so there is nothing to feature.",
        };
      }
      const sec = sectionContaining(spec, graph, obj.id);
      if (!sec) {
        return {
          resolved: false,
          parsed,
          reason:
            "\"" + obj.title + "\" exists but is not shown in any section " +
            "of this site, so it cannot be featured.",
        };
      }
      const section = spec.pages
        .find((p) => p.slug === sec.pageSlug)!
        .sections.find((s) => s.id === sec.sectionId)!;
      const before: string[] = Array.isArray(section.presentation.featuredIds)
        ? [...section.presentation.featuredIds]
        : [];
      const objectIds = [obj.id, ...before.filter((id) => id !== obj.id)];
      return {
        resolved: true,
        parsed,
        siteIntent: {
          kind: "set_featured",
          pageSlug: sec.pageSlug,
          sectionId: sec.sectionId,
          objectIds,
        },
        resolutionNote:
          "\"" + parsed.target + "\" is \"" + obj.title + "\"; featuring it " +
          "in the " + sec.component + " section.",
      };
    }
    case "hide_section":
    case "show_section": {
      const sec = findSection(spec, parsed.target);
      if (!sec) {
        return {
          resolved: false,
          parsed,
          reason:
            "No section named \"" + parsed.target + "\" exists in this " +
            "site's evidence, so there is nothing to " +
            (parsed.kind === "hide_section" ? "hide" : "show") + ".",
        };
      }
      return {
        resolved: true,
        parsed,
        siteIntent: {
          kind: "toggle_section",
          pageSlug: sec.pageSlug,
          sectionId: sec.sectionId,
          hidden: parsed.kind === "hide_section",
        },
        resolutionNote:
          "\"" + parsed.target + "\" names the " + sec.component + " section.",
      };
    }
    case "hide_object": {
      // Section-level hide wins: when the target names a section, the
      // section-level path is taken, untouched.
      const sec = findSection(spec, parsed.target);
      if (sec) {
        return {
          resolved: true,
          parsed,
          siteIntent: {
            kind: "toggle_section",
            pageSlug: sec.pageSlug,
            sectionId: sec.sectionId,
            hidden: true,
          },
          resolutionNote:
            "\"" + parsed.target + "\" names the " + sec.component +
            " section; hiding the section.",
        };
      }
      const obj = findObject(graph, parsed.target);
      if (!obj) {
        return {
          resolved: false,
          parsed,
          reason:
            "No object named \"" + parsed.target + "\" exists in this " +
            "site's evidence, so there is nothing to hide.",
        };
      }
      const objSec = sectionContaining(spec, graph, obj.id);
      if (!objSec) {
        return {
          resolved: false,
          parsed,
          reason:
            "\"" + obj.title + "\" exists but is not shown in any " +
            "section of this site, so it cannot be hidden.",
        };
      }
      const section = spec.pages
        .find((p) => p.slug === objSec.pageSlug)!
        .sections.find((s) => s.id === objSec.sectionId)!;
      const alreadyHidden = Array.isArray(section.presentation.hiddenObjectIds)
        ? section.presentation.hiddenObjectIds.includes(obj.id)
        : false;
      if (alreadyHidden) {
        return {
          resolved: false,
          parsed,
          reason:
            "\"" + obj.title + "\" is already hidden in the " +
            objSec.component + " section, so there is nothing to hide.",
        };
      }
      return {
        resolved: true,
        parsed,
        siteIntent: {
          kind: "deactivate_object",
          pageSlug: objSec.pageSlug,
          sectionId: objSec.sectionId,
          objectId: obj.id,
        },
        resolutionNote:
          "\"" + parsed.target + "\" is \"" + obj.title +
          "\"; hiding it in the " + objSec.component + " section.",
      };
    }
  }
}
