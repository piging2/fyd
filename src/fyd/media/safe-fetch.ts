/**
 * Shim: the canonical SSRF gate lives at @/fyd/net/safe-fetch.
 * This re-export keeps the media pipeline compiling. There is exactly one
 * SSRF implementation; do not add fetch logic here.
 */
export * from "../net/safe-fetch";
