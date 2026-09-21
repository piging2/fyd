/**
 * FYD canonical envelope kit (Ask FYD signing path).
 *
 * Port of the PING canonical envelope construction (A1 harvest):
 * Ed25519 signing with the payload hash bound into the signed bytes.
 *
 * Construction:
 *   1. stripped = body minus `proof` minus `payload_hash`
 *   2. payload_hash = raw SHA-256 hex of canonicalBytes(stripped)
 *   3. signature = Ed25519 over canonicalBytes({ ...stripped, payload_hash })
 *      (the signed bytes commit to the hash binding)
 *   4. attach proof = { verification_method, signature, public_key }
 *      (public_key is SPKI DER hex; the proof is never part of the signed bytes)
 *
 * Serializer pin (FYD decision, 2026-09-21): sha256-canonical-json-v1, the
 * same canonicalizer the proposal digest law uses. One serializer for
 * digests and signatures, so a signed proposal's payload_hash always equals
 * its proposal digest. The PING-side duality (HashAuthority UTF-16 sort vs
 * RFC-8785) is documented in the harvest and stays out of this module:
 * FYD pins this one rule and does not combine it with another.
 *
 * Key custody: this module never sees private keys. Callers pass a signing
 * function they already hold; the module only shapes bytes. node:crypto
 * only, zero npm dependencies.
 */

import { createHash, createPublicKey, verify } from "node:crypto";
import { canonicalize } from "../../lib/ping/ask-composer";
import type { SitePatchEnvelope } from "../../lib/ping/types";

/** Canonical bytes for the pinned serializer. Shared with the digest law. */
export function canonicalBytes(value: unknown): string {
  return canonicalize(value);
}

/** Raw SHA-256 hex of the canonical bytes of the stripped body. */
export function payloadHash(stripped: Record<string, unknown>): string {
  return createHash("sha256").update(canonicalBytes(stripped), "utf8").digest("hex");
}

/** A signing function the caller holds; the module never sees private keys. */
export interface Signer {
  /** Sign the exact canonical bytes; returns the signature as hex. */
  sign: (bytes: string) => string;
  /** SPKI DER hex of the Ed25519 public key matching the signer. */
  publicKeyDerHex: string;
}

/**
 * Sign an envelope body per the construction above. Throws when the signer
 * misbehaves; never silently produces an unsigned envelope.
 */
export function signEnvelope(body: Record<string, unknown>, signer: Signer): SitePatchEnvelope {
  const stripped: Record<string, unknown> = { ...body };
  delete stripped.proof;
  delete stripped.payload_hash;
  const hash = payloadHash(stripped);
  const signature = signer.sign(canonicalBytes({ ...stripped, payload_hash: hash }));
  if (typeof signature !== "string" || signature.length === 0) {
    throw new Error("envelope: signer returned an empty signature.");
  }
  return {
    // By construction the canonical bytes hash of the stripped body IS the
    // payload hash; the field names the harvested envelope law explicitly.
    canonical_bytes_hash: hash,
    body: stripped,
    payload_hash: hash,
    proof: {
      verification_method: "ed25519",
      signature,
      public_key: signer.publicKeyDerHex,
    },
  };
}

/**
 * Verify an envelope. Returns false (never throws) when anything is
 * malformed, the hash binding breaks, or the signature does not verify.
 */
export function verifyEnvelope(envelope: SitePatchEnvelope): boolean {
  try {
    const { body, payload_hash, proof, canonical_bytes_hash } = envelope;
    if (!body || typeof body !== "object" || Array.isArray(body)) return false;
    if (typeof payload_hash !== "string" || !/^[0-9a-f]{64}$/.test(payload_hash)) return false;
    if (typeof canonical_bytes_hash !== "string" || canonical_bytes_hash !== payloadHash(body)) return false;
    if (!proof || proof.verification_method !== "ed25519") return false;
    if (typeof proof.signature !== "string" || proof.signature.length === 0) return false;
    if (typeof proof.public_key !== "string" || proof.public_key.length === 0) return false;
    if (payloadHash(body) !== payload_hash) return false;
    const publicKey = createPublicKey({
      key: Buffer.from(proof.public_key, "hex"),
      format: "der",
      type: "spki",
    });
    const signedBytes = Buffer.from(canonicalBytes({ ...body, payload_hash }), "utf8");
    return verify(null, signedBytes, publicKey, Buffer.from(proof.signature, "hex"));
  } catch {
    return false;
  }
}
