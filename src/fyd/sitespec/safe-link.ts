/**
 * FYD safe-link resolver.
 *
 * A rendered link is an EXECUTABLE CAPABILITY (navigation, phone dialer,
 * mail client). An observed URL string in the object graph is only data.
 * This module is the one place that converts data into capability: a raw
 * observed value goes in, and either a safe navigable href or an explicit
 * non-navigable verdict comes out. The renderer never interpolates a raw
 * observed string into href/src on its own.
 *
 * Rules:
 * - Parser-based, not scheme-regex-based: the real URL parser decides what
 *   the string means, and the module then checks the parsed result against
 *   an explicit per-capability allowlist. A hostile string that parses to a
 *   non-allowlisted scheme (javascript:, data:, vbscript:, file:, blob:,
 *   ...) is non-navigable. There is no scheme regex to smuggle past.
 * - Whitespace/control-character smuggling fails closed: leading/trailing
 *   whitespace is trimmed, any remaining control character rejects the
 *   value before parsing, so "java\tscript:" style tricks never reach the
 *   parser as executable text.
 * - Relative references are non-navigable unless the caller passes an
 *   explicit baseUrl, and that base must itself resolve to a safe
 *   navigable URL. Bare hostnames ("example.com") have no scheme and are
 *   therefore non-navigable without a base.
 * - Capabilities are separate: "navigate" allows http:/https: only;
 *   "call" builds a tel: href from an author-formatted phone string that
 *   contains only phone characters (plus a mandatory digit); "email"
 *   builds a mailto: href from a minimally well-formed address. A value
 *   that is safe for one capability is never silently reused for another.
 * - Non-string input (null, arrays, objects) is non-navigable.
 *
 * Pure and deterministic: no I/O, no clock, no randomness.
 */

export type LinkCapability = "navigate" | "call" | "email";

/** A safe, renderer-usable href, or an explicit refusal to navigate. */
export type SafeLinkResult =
  | { kind: "safe"; href: string }
  | { kind: "non_navigable" };

/** Schemes the renderer may navigate to. Explicit allowlist. */
const NAVIGABLE_SCHEMES: readonly string[] = ["https:", "http:"];

/** Control characters are never valid inside a link value. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** Characters the "call" capability accepts in an author-formatted number. */
const TEL_ALLOWED = /^[+().\-\s\d]+$/;

/** Minimal shape for the "email" capability. Not a validator, a gate. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SafeLinkOptions {
  /**
   * Base URL used to resolve relative references. Must itself resolve to
   * a safe navigable URL; otherwise relative input stays non-navigable.
   */
  baseUrl?: string;
}

/**
 * Resolve a raw observed value to a safe href for the given capability.
 *
 * Returns { kind: "safe", href } when the value parses to an allowed
 * target, else { kind: "non_navigable" }. The caller renders an anchor
 * only for the "safe" case; the "non_navigable" case renders no link.
 */
export function resolveSafeLink(
  rawValue: unknown,
  capability: LinkCapability,
  opts: SafeLinkOptions = {},
): SafeLinkResult {
  if (typeof rawValue !== "string") return { kind: "non_navigable" };
  const raw = rawValue.trim();
  if (raw === "") return { kind: "non_navigable" };
  if (CONTROL_CHARS.test(raw)) return { kind: "non_navigable" };

  switch (capability) {
    case "call": {
      if (!TEL_ALLOWED.test(raw)) return { kind: "non_navigable" };
      if (!/\d/.test(raw)) return { kind: "non_navigable" };
      // tel: URIs carry no whitespace; keep the author's punctuation.
      return { kind: "safe", href: "tel:" + raw.replace(/\s+/g, "") };
    }
    case "email": {
      if (!EMAIL_SHAPE.test(raw)) return { kind: "non_navigable" };
      return { kind: "safe", href: "mailto:" + raw };
    }
    case "navigate": {
      let parsed: URL | null = null;
      try {
        parsed = new URL(raw);
      } catch {
        // Relative reference: only with an explicit, itself-safe base.
        if (!opts.baseUrl) return { kind: "non_navigable" };
        const base = resolveSafeLink(opts.baseUrl, "navigate");
        if (base.kind !== "safe") return { kind: "non_navigable" };
        try {
          parsed = new URL(raw, base.href);
        } catch {
          return { kind: "non_navigable" };
        }
      }
      // The URL parser lowercases the scheme; check the parsed result,
      // not the raw text, against the allowlist.
      if (!NAVIGABLE_SCHEMES.includes(parsed.protocol.toLowerCase())) {
        return { kind: "non_navigable" };
      }
      return { kind: "safe", href: parsed.href };
    }
  }
}
