/**
 * PING shared digest implementation — `sha256-canonical-json-v1`.
 *
 * NORTH STAR BACKLOG_PING.md rule 16 requires every lane to "commit the exact
 * digest algorithm/script with it, **or point at the shared digest
 * implementation**". This module IS that implementation. There is exactly one
 * definition of each primitive here; lanes import, never re-implement.
 *
 * Algorithm (pinned; reproduce any digest from the record alone):
 *
 *   1. CANONICALIZE the value to canonical JSON:
 *      - objects: keys sorted by UTF-16 code-unit order (the default
 *        String < sort), applied recursively; no whitespace anywhere;
 *        separators are exactly `,` and `:`.
 *      - arrays: element order preserved (array order is semantic).
 *      - strings: JSON.stringify escaping.
 *      - numbers/booleans: JSON.stringify (NaN and Infinity become null,
 *        -0 becomes 0 — JSON semantics, pinned).
 *      - null and undefined become the literal `null`. NOTE: an object key
 *        whose value is undefined is EMITTED as `"key":null`; it is NOT
 *        dropped. Functions and symbols become `null`.
 *      - toJSON methods are IGNORED: a Date canonicalizes as `{}`, not as
 *        its ISO string. Identity must not depend on host-defined
 *        serialization hooks.
 *   2. ENCODE the canonical string as UTF-8 bytes.
 *   3. SHA-256 over those bytes, hex-encoded lowercase.
 *
 * Shell reproduction recipe for any recorded digest:
 *   canonical=<canonical JSON per step 1, exact bytes>
 *   printf '%s' "$canonical" | sha256sum
 * (printf, not echo: no trailing newline. The digest covers the exact bytes.)
 *
 * The SHA-256 below is pure TypeScript (no node:crypto) so browser-safe
 * lanes can import this module. It is byte-identical to node:crypto's
 * SHA-256 on all inputs (proven by the pinned vectors in
 * src/lib/ping/__tests__/digest.test.ts). Harvested 2026-09-27 from
 * src/fyd/proceduralize/sha256.ts, extended to also accept raw bytes
 * (string | Uint8Array; Buffer is a Uint8Array) for content digests.
 *
 * Event-ID formulation note (live gateway runtime — OUT OF SCOPE here):
 * triage reported UnifiedEventRuntime.emit forms event IDs as sha256 over
 * JSON.stringify of {eventType, source, [namespace], logical_id|payload}.
 * No such formulation exists anywhere in the repo tree at
 * fyd/sprint-integration-2026-09-24 (a8ed5103); it lives in the live
 * gateway runtime, which this change does not touch. If the gateway ever
 * adopts this module, the event-ID record must name the exact field order
 * and canonicalization used. Lesson from FAILURE_LEDGER.md FL-20260920-031b
 * (OPEN): Lane B reported projection digest `37a5aa99...` and 11 candidate
 * formulations failed to reproduce it, because the exact algorithm was never
 * preserved. This module exists so that cannot recur.
 *
 * Pure functions only. No I/O, no authority, no state.
 */

/** Pinned algorithm label recorded alongside every digest (Ask proposals, projections, bindings). */
export const DIGEST_ALGORITHM = "sha256-canonical-json-v1" as const;

/** Rotate right on 32-bit words. */
function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/**
 * SHA-256 round constants: first 32 bits of the fractional parts of the
 * cube roots of the first 64 primes.
 */
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/** Raw SHA-256 compression over bytes. Harvested from fyd/proceduralize/sha256.ts. */
function sha256Bytes(bytes: Uint8Array): string {
  const bitLen = bytes.length * 8;
  const paddedLen = (((bytes.length + 8) >> 6) + 1) << 6;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const w = new Array<number>(64);

  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((x) => (x >>> 0).toString(16).padStart(8, "0"))
    .join("");
}

/**
 * SHA-256 hex digest. Strings are UTF-8 encoded; Uint8Array inputs
 * (including Node Buffers) are hashed as raw bytes.
 */
export function sha256Hex(input: string | Uint8Array): string {
  const bytes: Uint8Array =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  return sha256Bytes(bytes);
}

/**
 * Canonical JSON: recursively sorted object keys, no whitespace, UTF-8.
 * Verbatim formulation of the sha256-canonical-json-v1 canonicalizer
 * (previously defined in lib/ping/ask-composer.ts; the single definition
 * now lives here).
 */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const rec = value as Record<string, unknown>;
    const keys = Object.keys(rec).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(rec[k])}`).join(",")}}`;
  }
  return "null";
}

/** sha256-canonical-json-v1 digest of any JSON-like value. */
export function digestCanonical(value: unknown): string {
  return sha256Hex(canonicalize(value));
}

/**
 * Recompute the digest of `value` and compare against `expectedHex`
 * in constant time. Returns false (never throws) on any mismatch,
 * including length mismatch.
 */
export function verify(value: unknown, expectedHex: string): boolean {
  const actual = digestCanonical(value);
  if (actual.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  }
  return diff === 0;
}
