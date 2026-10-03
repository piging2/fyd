/**
 * FYD storage shim (portal lane, 2026-10-02).
 *
 * Problem: generated sites proxied through /api/live/[siteId] render inside a
 * sandboxed iframe (sandbox="allow-scripts allow-forms allow-popups", no
 * allow-same-origin). In that sandbox, reading window.localStorage /
 * window.sessionStorage throws a SecurityError, and embedded Next.js sites
 * that touch storage during hydration die with a user-visible
 * "Application error".
 *
 * Fix: this module builds a tiny self-contained <script> that the live proxy
 * route injects as the FIRST script in <head>. It probes storage availability
 * inside try/catch and installs graceful in-memory fallbacks, so downstream
 * page scripts never see storage throw. No new design; the iframe sandbox is
 * never loosened.
 */

/** Marker id used on the injected <script> tag (also used by route tests). */
export const STORAGE_SHIM_ID = "fyd-storage-shim";

/**
 * Raw JS payload injected as the first script in <head>.
 * Deliberately ES5-style (var/function, no modules, no imports) so it can be
 * inlined into any proxied HTML page and run before every other script.
 */
export const STORAGE_SHIM_JS = `;(function () {
  'use strict';
  function makeMemoryStorage() {
    var data = {};
    function keys() { return Object.keys(data); }
    return {
      get length() { return keys().length; },
      key: function (i) {
        var ks = keys();
        return i >= 0 && i < ks.length ? ks[i] : null;
      },
      getItem: function (k) {
        k = String(k);
        return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null;
      },
      setItem: function (k, v) { data[String(k)] = String(v); },
      removeItem: function (k) { delete data[String(k)]; },
      clear: function () { data = {}; }
    };
  }
  function storageUsable(kind) {
    try {
      var s = window[kind];
      if (s == null || typeof s.getItem !== 'function') return false;
      var probe = '__fyd_shim_probe__';
      s.setItem(probe, '1');
      s.removeItem(probe);
      return true;
    } catch (e) {
      return false;
    }
  }
  function installFallback(kind) {
    var fallback = makeMemoryStorage();
    try {
      Object.defineProperty(window, kind, {
        configurable: true,
        writable: true,
        value: fallback
      });
      return;
    } catch (e) { /* locked-down host: try plain assignment */ }
    try { window[kind] = fallback; } catch (e) { /* last resort: leave as-is */ }
  }
  try {
    if (!storageUsable('localStorage')) installFallback('localStorage');
    if (!storageUsable('sessionStorage')) installFallback('sessionStorage');
  } catch (e) { /* never break page boot */ }
})();`;

/**
 * Inject the storage shim <script> immediately after the opening <head> tag
 * (case-insensitive, attributes tolerated). Falls back to after <html> when
 * there is no <head>. Returns the input unchanged when the document has
 * neither (non-HTML responses are never touched). Idempotent: a document that
 * already carries the shim is returned unchanged.
 */
export function injectStorageShim(html: string): string {
  if (!html || html.indexOf(STORAGE_SHIM_ID) !== -1) return html;
  const tag = `<script id="${STORAGE_SHIM_ID}" data-fyd-storage-shim="1">${STORAGE_SHIM_JS}</script>`;
  const headAt = findTagEnd(html, "head");
  if (headAt !== -1) return html.slice(0, headAt) + tag + html.slice(headAt);
  const htmlAt = findTagEnd(html, "html");
  if (htmlAt !== -1) return html.slice(0, htmlAt) + tag + html.slice(htmlAt);
  return html;
}

/** Index just past the closing ">" of the first <tag ...>, or -1. */
function findTagEnd(html: string, tag: string): number {
  const lower = html.toLowerCase();
  const open = lower.indexOf("<" + tag);
  if (open === -1) return -1;
  // The char after the tag name must end the name (whitespace, ">", or "/").
  const after = lower.charAt(open + 1 + tag.length);
  if (after !== ">" && after !== "/" && !/\s/.test(after)) return -1;
  const end = html.indexOf(">", open);
  return end === -1 ? -1 : end + 1;
}
