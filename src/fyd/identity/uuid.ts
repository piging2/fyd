/**
 * Deterministic UUIDv5 derivation.
 *
 * Harvested semantics (EXTRACT, dependency-light): PING's canonical
 * identity layer derives stable IDs from (namespace, name) pairs
 * (see /home/nolan/ping/runtime/kernel/identity/canonical-id-generator.ts
 * and identity-authority.ts: generateUUIDv5(namespace, name)). The FYD
 * identity lane reuses that derivation rule only; it does not depend on
 * PING's runtime and FYD login never requires MissionRuntime.
 *
 * Implemented on node:crypto (sha1) so there are no new dependencies.
 */

import { createHash } from "node:crypto";

/** Well-known URL namespace UUID (RFC 9562) used to bootstrap our namespace. */
const URL_NAMESPACE = "6ba7b811-9dad-11d1-80b4-00c04fd430c8";

function uuidToBytes(uuid: string): Buffer {
  const hex = uuid.replace(/-/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) {
    throw new Error("uuidv5: namespace is not a valid UUID");
  }
  return Buffer.from(hex, "hex");
}

/** UUIDv5: sha1(namespaceBytes || name), version and variant bits set. */
export function uuidv5(namespace: string, name: string): string {
  const nsBytes = uuidToBytes(namespace);
  const digest = createHash("sha1").update(nsBytes).update(name, "utf8").digest();
  digest[6] = (digest[6] & 0x0f) | 0x50; // version 5
  digest[8] = (digest[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = digest.subarray(0, 16).toString("hex");
  return (
    hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" +
    hex.slice(16, 20) + "-" + hex.slice(20, 32)
  );
}

/**
 * The FYD identity namespace: one fixed UUID derived once from a stable
 * string. All FYD identity IDs derive from (namespace, name) under this.
 */
export const FYD_IDENTITY_NAMESPACE: string = uuidv5(
  URL_NAMESPACE,
  "https://ping.social/fyd/identity/v1"
);

/** True when the value parses as a UUID. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
