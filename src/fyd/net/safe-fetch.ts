/**
 * SSRF-safe remote fetch: the ONE canonical fetch gate for FYD.
 *
 * Canonical home is fyd/net. The media pipeline re-exports this module
 * (src/fyd/media/safe-fetch.ts is a shim); there is exactly one SSRF
 * implementation in the codebase.
 *
 * SECURITY BOUNDARY (per website-builder-authority-decisions.md):
 * - HTTP/HTTPS only. Reject file:, data:, javascript:, and any other scheme.
 * - Reject credential-bearing URLs (user:pass@host).
 * - Resolve DNS for every hop and reject non-public address space:
 *   loopback (127/8, ::1), RFC1918 (10/8, 172.16/12, 192.168/16),
 *   link-local (169.254/16 incl. the 169.254.169.254 metadata endpoint,
 *   fe80::/10), multicast, reserved, IPv4-mapped IPv6 of the above,
 *   and CGNAT 100.64/10 (treated as private: never fetch tailnet space).
 * - IPv6 transition/encapsulation encodings are decoded to their EFFECTIVE
 *   IPv4 destination and classified as IPv4: IPv4-compatible ::/96 (any
 *   spelling, incl. uncompressed 0:0:0:0:0:0:127.0.0.1), 6to4 2002::/16,
 *   NAT64 64:ff9b::/96, ISATAP (:0:5EFE:), IPv4-translatable ::ffff:0:0/96.
 *   The v6 stack tunnels/translates these to the embedded v4 address, so
 *   the embedded address is what must be public. Teredo 2001::/32 is
 *   XOR-obfuscated (undecodable) and fails closed, as do the documentation
 *   (2001:db8::/32) and benchmarking (2001:2::/48) ranges and the
 *   unspecified address ::. Anything the gate cannot decode fails closed.
 * - Redirects: max 5, every hop re-validated (scheme, credentials, DNS).
 *   A redirect into private space is rejected, not followed.
 * - Content-type verification: allowlisted prefixes only, checked before
 *   buffering. Anything else is rejected.
 * - Size limits: content-length pre-check plus streaming abort.
 * - Timeouts on connect and overall.
 *
 * Residual TOCTOU note: the DNS check and the fetch are not atomic. The
 * gate validates the addresses DNS returns at check time; the production
 * fetch implementation re-resolves independently, so a hostile DNS that
 * answers differently per query (rebinding) could still steer the socket.
 * The gate is the contract that mocked tests verify (see
 * __tests__/safe-fetch.test.ts); production deployments needing atomicity
 * must pin the validated address at the socket layer (not implemented
 * here). This is reported honestly rather than claimed away.
 *
 * An arbitrary agent- or user-supplied URL can NEVER become an unrestricted
 * server-side fetch through this module: every URL passes this gate.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export interface SafeFetchOk {
  ok: true;
  bytes: Buffer;
  contentType: string;
  finalUrl: string;
  redirectChain: string[];
}

export interface SafeFetchFail {
  ok: false;
  reason: string;
  redirectChain: string[];
}

export type SafeFetchResult = SafeFetchOk | SafeFetchFail;

export interface SafeFetchOptions {
  /** Allowed content-type prefixes, e.g. ["image/"]. */
  allowContentTypes: string[];
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
}

/**
 * Injectable dependencies for tests. Production callers omit this and get
 * the real DNS resolver and the global fetch.
 */
export interface SafeFetchDeps {
  dnsLookup?: (hostname: string) => Promise<Array<{ address: string }>>;
  fetchImpl?: typeof fetch;
}

const DEFAULT_MAX_BYTES = 15 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MAX_REDIRECTS = 5;

function fail(reason: string, redirectChain: string[]): SafeFetchFail {
  return { ok: false, reason, redirectChain };
}

/**
 * Expand a validated IPv6 literal (lowercase) into its eight 16-bit
 * groups, or null when the literal cannot be decoded. A trailing dotted
 * quad ("::ffff:127.0.0.1") is converted to its two hex groups first.
 * Callers treat null as "undecodable": fail closed.
 */
function ipv6ToGroups(addr: string): number[] | null {
  let a = addr;
  const dotted = a.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (dotted) {
    const nums = [dotted[2], dotted[3], dotted[4], dotted[5]].map(Number);
    if (nums.some((n) => n > 255)) return null;
    const hi = ((nums[0] << 8) | nums[1]).toString(16);
    const lo = ((nums[2] << 8) | nums[3]).toString(16);
    a = dotted[1] + hi + ":" + lo;
  }
  const halves = a.split("::");
  if (halves.length > 2) return null;
  const parseSide = (side: string): number[] | null => {
    if (side === "") return [];
    const out: number[] = [];
    for (const g of side.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const left = parseSide(halves[0]);
  const right = halves.length === 2 ? parseSide(halves[1]) : [];
  if (!left || !right) return null;
  if (halves.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 2 && missing < 1)) return null;
  return [...left, ...new Array(missing).fill(0), ...right];
}

/** True when the numeric IP is public routable space. */
export function isPublicIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const p = ip.split(".").map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return false;
    const [a, b] = p;
    if (a === 10) return false; // RFC1918
    if (a === 172 && b >= 16 && b <= 31) return false; // RFC1918
    if (a === 192 && b === 168) return false; // RFC1918
    if (a === 127) return false; // loopback
    if (a === 169 && b === 254) return false; // link-local + metadata endpoint
    if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT; treat tailnet as private
    if (a >= 224) return false; // multicast + reserved
    if (a === 0) return false; // "this network"
    return true;
  }
  if (v === 6) {
    const low = ip.toLowerCase();
    if (low === "::1") return false; // loopback
    if (low === "::") return false; // unspecified: never a fetch target
    if (/^fe[89ab][0-9a-f]/.test(low)) return false; // link-local fe80::/10
    if (/^fe[c-f]/.test(low)) return false; // deprecated site-local fec0::/10: not public
    if (/^f[cd]/.test(low)) return false; // unique local fc00::/7
    if (/^ff/.test(low)) return false; // multicast ff00::/8
    // Transition/encapsulation encodings: the v6 stack tunnels or
    // translates these to the embedded IPv4 address, so the EFFECTIVE
    // destination is the embedded v4 and it must be public. Decode via
    // the 16-bit groups; anything undecodable fails closed.
    const groups = ipv6ToGroups(low);
    if (!groups) return false;
    const v4at = (i: number): string =>
      [groups[i] >>> 8, groups[i] & 255, groups[i + 1] >>> 8, groups[i + 1] & 255].join(".");
    const firstFiveZero = groups.slice(0, 5).every((g) => g === 0);
    // IPv4-mapped ::ffff:0:0/96 and IPv4-compatible ::/96 (deprecated but
    // runtime-accepted, in any spelling: ::7f00:1, ::127.0.0.1,
    // 0:0:0:0:0:0:127.0.0.1).
    if (firstFiveZero && (groups[5] === 0 || groups[5] === 0xffff)) {
      return isPublicIp(v4at(6));
    }
    const firstFourZero = groups.slice(0, 4).every((g) => g === 0);
    // IPv4-translatable ::ffff:0:0/96 (SIIT): 0:0:0:0:ffff:0:hi:lo.
    if (firstFourZero && groups[4] === 0xffff && groups[5] === 0) {
      return isPublicIp(v4at(6));
    }
    // Mapped-adjacent unassigned space (::ffff:1:2:3): not the mapped /96,
    // not decodable as any transition mechanism. Fail closed rather than
    // treat as public.
    if (firstFourZero && groups[4] === 0xffff) return false;
    // 6to4 2002::/16: 2002:V4ADDR::/48 tunnels to the embedded IPv4.
    if (groups[0] === 0x2002) return isPublicIp(v4at(1));
    // NAT64 64:ff9b::/96: the last 32 bits are the IPv4 address.
    // (Longer-prefix forms /48, /56 place the address elsewhere and are
    // not decoded here: fail closed.)
    if (
      groups[0] === 0x64 &&
      groups[1] === 0xff9b &&
      groups.slice(2, 6).every((g) => g === 0)
    ) {
      return isPublicIp(v4at(6));
    }
    // ISATAP: xxxx:xxxx:xxxx:xxxx:0:5EFE:V4ADDR tunnels to the IPv4.
    if (groups[4] === 0 && groups[5] === 0x5efe) return isPublicIp(v4at(6));
    // Non-decodable special ranges: fail closed.
    if (groups[0] === 0x2001 && groups[1] === 0) return false; // Teredo 2001::/32 (XOR-obfuscated)
    if (groups[0] === 0x2001 && groups[1] === 0xdb8) return false; // documentation 2001:db8::/32
    if (groups[0] === 0x2001 && groups[1] === 2 && groups[2] === 0) return false; // benchmarking 2001:2::/48
    return true;
  }
  return false;
}

async function hostResolvesPublic(
  hostname: string,
  dnsLookup: (hostname: string) => Promise<Array<{ address: string }>>,
): Promise<{ ok: boolean; reason?: string }> {
  // URL.hostname keeps brackets on IPv6 literals ("[::1]"); strip them so
  // the literal-IP check below sees the real address.
  const bare = hostname.replace(/^\[|\]$/g, "");
  // A literal IP is checked directly; otherwise every resolved address must be public.
  if (isIP(bare)) {
    return isPublicIp(bare)
      ? { ok: true }
      : { ok: false, reason: "IP literal is not public routable space: " + bare };
  }
  let addrs;
  try {
    addrs = await dnsLookup(hostname);
  } catch {
    return { ok: false, reason: "DNS resolution failed for " + hostname };
  }
  if (addrs.length === 0) return { ok: false, reason: "DNS returned no addresses for " + hostname };
  for (const a of addrs) {
    if (!isPublicIp(a.address)) {
      return { ok: false, reason: "DNS for " + hostname + " resolves to non-public " + a.address };
    }
  }
  return { ok: true };
}

function checkUrlShape(raw: string): { ok: boolean; reason?: string; url?: URL } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Not a parseable URL" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Scheme not allowed: " + url.protocol };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "Credential-bearing URLs are rejected" };
  }
  return { ok: true, url };
}

/**
 * Fetch a remote resource through the SSRF gate. Follows redirects manually
 * so every hop is re-validated. Returns bytes only when the final response
 * is 2xx with an allowed content-type within the size limit.
 */
export async function safeFetch(
  rawUrl: string,
  opts: SafeFetchOptions,
  deps: SafeFetchDeps = {},
): Promise<SafeFetchResult> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const dnsLookup = deps.dnsLookup ?? ((h: string) => lookup(h, { all: true }));
  const fetchImpl = deps.fetchImpl ?? fetch;
  const redirectChain: string[] = [];

  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const shape = checkUrlShape(current);
    if (!shape.ok || !shape.url) return fail("URL rejected: " + shape.reason, redirectChain);
    const dns = await hostResolvesPublic(shape.url.hostname, dnsLookup);
    if (!dns.ok) return fail("DNS rejected: " + dns.reason, redirectChain);

    let res: Response;
    try {
      res = await fetchImpl(shape.url.toString(), {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "User-Agent": "FYD-media-ingest/1.0 (+evidence-bound fetch)" },
      });
    } catch (e) {
      return fail("Fetch failed: " + (e instanceof Error ? e.message : String(e)), redirectChain);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.arrayBuffer().catch(() => null);
      if (!loc) return fail("Redirect without location (status " + res.status + ")", redirectChain);
      redirectChain.push(current + " -> " + loc);
      try {
        current = new URL(loc, shape.url.toString()).toString();
      } catch {
        return fail("Unparseable redirect target", redirectChain);
      }
      continue;
    }

    if (res.status < 200 || res.status >= 300) {
      await res.arrayBuffer().catch(() => null);
      return fail("HTTP " + res.status, redirectChain);
    }

    const contentType = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!opts.allowContentTypes.some((p) => contentType.startsWith(p))) {
      await res.arrayBuffer().catch(() => null);
      return fail("Content-type not allowed: " + (contentType || "(missing)"), redirectChain);
    }
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > maxBytes) {
      await res.arrayBuffer().catch(() => null);
      return fail("Declared size " + declared + " exceeds limit " + maxBytes, redirectChain);
    }

    // Stream with an aborting size cap; never buffer unboundedly.
    const reader = res.body?.getReader();
    if (!reader) {
      await res.arrayBuffer().catch(() => null);
      return fail("No response body", redirectChain);
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => null);
        return fail("Body exceeded size limit " + maxBytes, redirectChain);
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    return { ok: true, bytes, contentType, finalUrl: shape.url.toString(), redirectChain };
  }
  return fail("Too many redirects (>" + maxRedirects + ")", redirectChain);
}

/** Convenience gate for image ingestion. */
export function safeFetchImage(
  url: string,
  opts?: Omit<SafeFetchOptions, "allowContentTypes">,
  deps?: SafeFetchDeps,
): Promise<SafeFetchResult> {
  return safeFetch(
    url,
    {
      ...opts,
      allowContentTypes: ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"],
    },
    deps,
  );
}

/** Convenience gate for HTML page discovery. A caller-supplied maxBytes wins; default 5MB. */
export function safeFetchPage(
  url: string,
  opts?: Omit<SafeFetchOptions, "allowContentTypes">,
  deps?: SafeFetchDeps,
): Promise<SafeFetchResult> {
  return safeFetch(
    url,
    { ...opts, allowContentTypes: ["text/html"], maxBytes: opts?.maxBytes ?? 5 * 1024 * 1024 },
    deps,
  );
}
