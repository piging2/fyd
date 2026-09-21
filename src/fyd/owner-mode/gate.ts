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
