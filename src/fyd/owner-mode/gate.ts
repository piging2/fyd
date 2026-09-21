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
 * Evaluated at module load on the client (NEXT_PUBLIC_* is inlined at
 * build time) and per-call on the server.
 */
export function isDemoOwnerModeEnabled(): boolean {
  return process.env[DEMO_OWNER_MODE_ENV_VAR] === "1";
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
  const h = host.split(":")[0].trim().toLowerCase().replace(/^\[|\]$/g, "");
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
  if (
    h.startsWith("fc") ||
    h.startsWith("fd") ||
    h.startsWith("fe80:") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h.endsWith(".lan")
  )
    return true;
  return false;
}
