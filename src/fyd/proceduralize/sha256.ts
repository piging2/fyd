/**
 * Shared digest re-export. The single SHA-256/canonical-JSON implementation
 * lives in src/lib/ping/digest.ts (algorithm `sha256-canonical-json-v1`).
 * This module re-exports it so existing importers keep working unchanged.
 *
 * Pure TypeScript, no node:crypto: safe to import from client components
 * (browser bundle), as before.
 */
export { sha256Hex } from "../../lib/ping/digest";
