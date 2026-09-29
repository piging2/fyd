/**
 * Determinism tests for the shared digest implementation
 * (src/lib/ping/digest.ts, algorithm `sha256-canonical-json-v1`).
 *
 * These pin exact input -> digest strings so any future divergence in the
 * shared implementation (or in a lane-local copy that should have converged)
 * fails loudly. Pinned values were generated from node:crypto as an
 * independent reference, plus the published SHA-256 test vectors.
 *
 * Context: FAILURE_LEDGER.md FL-20260920-031b — Lane B's projection digest
 * `37a5aa99...` could not be reproduced by 11 candidate formulations because
 * the exact algorithm was never preserved. This suite is the tripwire.
 */
import { createHash } from "node:crypto";
import {
  DIGEST_ALGORITHM,
  canonicalize,
  digestCanonical,
  sha256Hex,
  verify,
} from "../digest";

const ref = (s: string): string =>
  createHash("sha256").update(s, "utf8").digest("hex");

describe("sha256-canonical-json-v1", () => {
  test("algorithm label is pinned", () => {
    expect(DIGEST_ALGORITHM).toBe("sha256-canonical-json-v1");
  });

  test("sha256Hex matches published SHA-256 test vectors", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256Hex("The quick brown fox jumps over the lazy dog")).toBe(
      "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
    );
  });

  test("sha256Hex padding edges (55/56-byte inputs)", () => {
    expect(sha256Hex("x".repeat(55))).toBe(
      "d5e285683cd4efc02d021a5c62014694958901005d6f71e89e0989fac77e4072",
    );
    expect(sha256Hex("x".repeat(56))).toBe(
      "04c26261370ee7541549d16dee320c723e3fd14671e66a099afe0a377c16888e",
    );
  });

  test("sha256Hex unicode is UTF-8", () => {
    expect(sha256Hex("héllo → 世界 🌍")).toBe(
      "cd5754a421a599bc892b012475e4956f155c21b72d0a88ab66961c5df11ab5b7",
    );
  });

  test("sha256Hex accepts raw bytes identically to node:crypto", () => {
    const bufs = [
      Buffer.from(""),
      Buffer.from("abc", "utf8"),
      Buffer.from("héllo → 世界 🌍", "utf8"),
      Buffer.from([0, 1, 2, 255, 0, 254, 128]),
      Buffer.from(Array.from({ length: 200 }, (_, i) => (i * 7) % 256)),
    ];
    for (const b of bufs) {
      expect(sha256Hex(b)).toBe(createHash("sha256").update(b).digest("hex"));
    }
  });

  test("sha256Hex agrees with node:crypto on strings", () => {
    for (const s of ["", "abc", "x".repeat(1000), "héllo → 世界 🌍"]) {
      expect(sha256Hex(s)).toBe(ref(s));
    }
  });
});

describe("canonicalize", () => {
  test("sorted keys, no whitespace", () => {
    expect(canonicalize({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
    expect(canonicalize({ z: { b: [3, 2, 1], a: null }, a: "x" })).toBe(
      '{"a":"x","z":{"a":null,"b":[3,2,1]}}',
    );
  });

  test("edge semantics are pinned", () => {
    expect(canonicalize({})).toBe("{}");
    expect(canonicalize([])).toBe("[]");
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize(undefined)).toBe("null");
    // undefined-valued keys are EMITTED as null, not dropped
    expect(canonicalize({ u: undefined })).toBe('{"u":null}');
    // toJSON hooks are ignored
    expect(canonicalize({ d: new Date("2026-01-01T00:00:00.000Z") })).toBe(
      '{"d":{}}',
    );
    // bigint never throws; becomes null
    expect(canonicalize({ n: BigInt(10) })).toBe('{"n":null}');
  });
});

describe("digestCanonical + verify", () => {
  test("pinned input -> digest vectors", () => {
    expect(digestCanonical({ b: 2, a: 1 })).toBe(
      "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
    );
    expect(digestCanonical({ z: { b: [3, 2, 1], a: null }, a: "x" })).toBe(
      "42f1ccb0ff63fe23b812d274b8af4e430f5e720638237ea207ce4528b2a5d2c5",
    );
    expect(digestCanonical(["a", 1, null])).toBe(
      "0ae764bffd3a17b6454c8d9ebf712311d9b92efce67a4e4ea4f095fc05ed0122",
    );
    expect(digestCanonical({})).toBe(
      "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    );
    // key order must not affect the digest
    expect(digestCanonical({ a: 1, b: 2 })).toBe(
      digestCanonical({ b: 2, a: 1 }),
    );
  });

  test("verify accepts the pinned digest and rejects tampering", () => {
    const body = { b: 2, a: 1 };
    const good =
      "43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777";
    expect(verify(body, good)).toBe(true);
    expect(verify({ b: 2, a: 999 }, good)).toBe(false);
    expect(verify(body, "0".repeat(64))).toBe(false);
    expect(verify(body, "short")).toBe(false);
  });
});
