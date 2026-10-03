/**
 * FYD embed shims (portal lane, 2026-10-02).
 *
 * Problem: generated sites proxied through /api/live/[siteId] render inside a
 * sandboxed iframe (sandbox="allow-scripts allow-forms allow-popups", no
 * allow-same-origin). In that sandbox, reading window.localStorage /
 * window.sessionStorage throws a SecurityError, and embedded Next.js sites
 * that touch storage during hydration die with a user-visible
 * "Application error".
 *
 * This module builds tiny self-contained <script>s that the live proxy route
 * injects as the first scripts in <head>:
 *
 *  1. STORAGE SHIM: probes storage availability inside try/catch and installs
 *     graceful in-memory fallbacks, so downstream page scripts never see
 *     storage throw. No new design; the iframe sandbox is never loosened.
 *
 *  2. CRASH BEACON: some embedded apps probe ACROSS the frame boundary
 *     (e.g. Happy Place's VisualSlot reading window.parent.location.origin
 *     in a mount effect). In the sandbox that read is a browser-enforced
 *     SecurityError no same-document script can prevent: window.parent is
 *     unforgeable, the throwing code lives in origin-served chunks the proxy
 *     never rewrites, and the read throws during eager argument evaluation
 *     inside React's commit phase, straight into Next.js's global error
 *     boundary ("Application error"). The beacon cannot stop that crash, so
 *     instead it reports it: on a matching sandbox location-probe error it
 *     postMessages the parent, which swaps the dead iframe for FYD's graceful
 *     fallback UI.
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

// ==== FYD CRASH BEACON (portal lane 2026-10-02): begin ====
// Reports the unshimmable sandbox location-probe crash (see module docstring)
// to the embedding FYD page via postMessage, so the parent can swap the dead
// iframe for its graceful fallback UI instead of showing "Application error".

/** Marker id used on the injected beacon <script> tag. */
export const CRASH_BEACON_ID = "fyd-crash-beacon";

/**
 * postMessage type the beacon sends and the portal preview listens for.
 * The parent validates event.source against its own iframe element; the
 * opaque iframe origin ("null") is expected and must NOT be allow-listed
 * by origin.
 */
export const CRASH_BEACON_MESSAGE_TYPE = "fyd-embed-crash";

/**
 * Raw JS payload for the crash beacon. ES5-style like the storage shim.
 * Matches only the sandbox location-probe failure mode (SecurityError
 * reading 'origin' from the parent frame's Location); every other error is
 * left alone so unrelated page bugs keep their normal behavior.
 */
export const CRASH_BEACON_JS = `;(function () {
  'use strict';
  var MESSAGE_TYPE = '${CRASH_BEACON_MESSAGE_TYPE}';
  function messageOf(err) {
    try {
      if (err == null) return '';
      if (typeof err === 'string') return err;
      return String(err.message || err);
    } catch (e) { return ''; }
  }
  function isSandboxLocationCrash(err) {
    var msg = messageOf(err);
    if (msg.indexOf('SecurityError') === -1) return false;
    return msg.indexOf("from 'Location'") !== -1 ||
      msg.indexOf('Sandbox access violation') !== -1;
  }
  function report(reason) {
    try {
      window.parent.postMessage({ type: MESSAGE_TYPE, reason: String(reason).slice(0, 200) }, '*');
    } catch (e) { /* parent unreachable: nothing to report to */ }
  }
  try {
    window.addEventListener('error', function (ev) {
      var err = ev && (ev.error || ev.message);
      if (isSandboxLocationCrash(err)) report(messageOf(err).slice(0, 200));
    }, true);
    window.addEventListener('unhandledrejection', function (ev) {
      if (ev && isSandboxLocationCrash(ev.reason)) {
        report('unhandledrejection: ' + messageOf(ev.reason).slice(0, 160));
      }
    });
  } catch (e) { /* never break page boot */ }
})();`;

/**
 * Inject the crash beacon <script> immediately after the opening <head> tag,
 * with the same placement/idempotency contract as injectStorageShim.
 */
export function injectCrashBeacon(html: string): string {
  if (!html || html.indexOf(CRASH_BEACON_ID) !== -1) return html;
  const tag = `<script id="${CRASH_BEACON_ID}" data-fyd-crash-beacon="1">${CRASH_BEACON_JS}</script>`;
  const headAt = findTagEnd(html, "head");
  if (headAt !== -1) return html.slice(0, headAt) + tag + html.slice(headAt);
  const htmlAt = findTagEnd(html, "html");
  if (htmlAt !== -1) return html.slice(0, htmlAt) + tag + html.slice(htmlAt);
  return html;
}

/**
 * Apply every embed shim the live proxy injects. The storage shim stays the
 * first script after <head> (its documented contract); the crash beacon
 * follows it. Idempotent: re-running over an already-shimmed document is a
 * no-op.
 */
export function injectEmbedShims(html: string): string {
  return injectStorageShim(injectCrashBeacon(html));
}
// ==== FYD CRASH BEACON (portal lane 2026-10-02): end ====

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
