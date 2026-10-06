/**
 * Stored-XSS guard (P1-1, red-team round 1, 2026-10-03): the websiteHref and
 * the fallback message reach this sink from projected/onboarding data, which
 * is untrusted. Two independent layers:
 *   1. escapeHtml() encodes every interpolated value for its HTML context
 *      (attribute for href, text for message), so `"` or `<` cannot break
 *      out of markup.
 *   2. safeWebHref() additionally allows only parseable http:/https: URLs
 *      and rejects quotes, angle brackets, backticks, and whitespace, so
 *      javascript:, data:, and malformed URLs never render as a clickable
 *      link at all.
 * Kept outside the Next route module so only valid route exports remain.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export function safeWebHref(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (/[\s"<>`]/.test(raw)) return null;
  return escapeHtml(raw);
}

