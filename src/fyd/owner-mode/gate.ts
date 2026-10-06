/**
 * H3 lane: DEMO OWNER MODE is not authentication.
 *
 * Read this before trusting anything in this directory:
 *
 * - There is no identity verification here. No session, no signature, no
 *   credential check of any kind. The "actor" is a label typed into a demo
 *   control; the "relationship" is a hard-coded demo mapping.
 * - This exists so the demo can SHOW the owner-action seam (actor ->
 *   relationship -> capability evaluation -> gated operation) with the UI
 *   banner making the demo status unmistakable.
 * - Nothing in this directory may ever be consulted for a real
 *   authorization decision. If production owner auth is built later, it
 *   must be built as a separate, reviewed mechanism; these demo verdicts
 *   must not be reused, wrapped, or "upgraded".
 *
 * Dev-only gate: the component renders nothing unless
 * NEXT_PUBLIC_FYD_DEMO_OWNER_MODE=1 (see ./gate.ts).
 */

export const DEMO_OWNER_MODE_ENV_VAR = "NEXT_PUBLIC_FYD_DEMO_OWNER_MODE";

/**
 * True only when the demo explicitly opts in via the env var.
 *
 * SERVER-ONLY RESOLUTION (hydration #418, 2026-09-25): call this in a
 * server component / route handler and pass the resolved boolean down to
 * client components as a prop. Client components MUST NOT call this
 * themselves: NEXT_PUBLIC_* is inlined into the client bundle at build
 * time while the server reads it at request time, and any skew between
 * the two is a guaranteed hydration mismatch. One resolution source,
 * passed down.
 */
export function isDemoOwnerModeEnabled(): boolean {
  // Direct process.env.NEXT_PUBLIC_* access (not via DEMO_OWNER_MODE_ENV_VAR)
  // so Next.js inlines the value at build time. Bracket-notation access
  // defeats inlining, causing server/client skew and hydration #418.
  return process.env.NEXT_PUBLIC_FYD_DEMO_OWNER_MODE === "1";
}

/**
 * Lane D: the demo-owner network gate. True only for localhost and
 * private-network hosts. The customize approval API refuses anything else:
 * demo-owner mode must never be reachable over a public bind.
 *
 * Ranges: loopback, RFC 1918 (10/8, 172.16/12, 192.168/16), link-local
 * (169.254/16, fe80::/10), IPv6 unique-local (fc00::/7), the Tailscale
 * range 100.64.0.0/10 (carrier-grade NAT space that Tailscale assigns
 * from; the standing demo route is the private Tailscale forward), and
 * .local/.internal/.lan names.
 */
export function isPrivateHost(host: string): boolean {
  const raw = host.trim().toLowerCase();
  // Extract the host without the port. Bracketed IPv6 ([::1]:3000) unwraps
  // to the literal; a bare IPv6 literal keeps its colons; otherwise strip
  // :port. (F03: the old code split(":")[0] first, so "::1" and "fe80:"
  // could never match and the fc/fd prefix test below saw only fragments.)
  let h: string;
  const bracketed = raw.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (bracketed) {
    h = bracketed[1];
  } else if ((raw.match(/:/g) ?? []).length > 1) {
    h = raw;
  } else {
    h = raw.split(":")[0];
  }
  if (h === "localhost" || h === "127.0.0.1" || h === "::1") return true;
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // Tailscale
    if (a === 169 && b === 254) return true; // link-local
    return false;
  }
  if (h.includes(":")) {
    // IPv6 unique-local fc00::/7 and link-local fe80::/10, matched on the
    // first hextet of the full literal. (F03: the old h.startsWith("fc") /
    // h.startsWith("fd") matched ANY DNS name beginning fc/fd, e.g.
    // fcdemo.example.com — a public host classified private.)
    if (/^f[cd][0-9a-f]*:/.test(h)) return true;
    if (/^fe[89ab][0-9a-f]*:/.test(h)) return true;
    return false;
  }
  return h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".lan");
}

/**
 * DEPLOY-2026-10-02: explicit dev-host allowlist for the public demo
 * deployment. isPrivateHost alone refuses every public host, which is the
 * correct default. Setting FYD_DEV_OWNER_HOSTS (comma-separated hostnames,
 * compared against the request Host header without the port) explicitly
 * opts those hosts into DEVELOPMENT OWNER MODE. Server-side only, never a
 * blanket public opening. Empty/unset = localhost and private networks
 * only, exactly as before.
 */
export function isDevOwnerHost(host: string): boolean {
  if (isPrivateHost(host)) return true;
  const allow = (process.env.FYD_DEV_OWNER_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length === 0) return false;
  const h = host.split(":")[0].trim().toLowerCase();
  return allow.includes(h);
}
