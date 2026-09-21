/**
 * bff-envelope@1 signing and submission. SERVER ONLY.
 *
 * Builds the exact signed envelope the PING gateway's social_ingest_adapter
 * verifies: Ed25519 over sorted-key canonical bytes of
 * {type, payload, metadata}, proof {algorithm, signature (base64), publicKey
 * (PEM SPKI)}. Canonicalization authority stays with the runtime; the
 * serializer is the verbatim dev port shared with the practice BFF
 * (src/lib/ping/dev-signer.ts), labeled bff-envelope@1 and kept separate
 * from the constitutional canonicalizeObject.
 */

import { canonicalizeJson } from "@/lib/ping/dev-signer";
import { signAsFydIdentity } from "./key-custody";
import { fydGatewayBaseUrl } from "./config";
import { FYD_SOCIAL_GENERATOR_VERSION as GEN } from "./transition-id";

export type SocialEventType = "OBJECT_CREATED" | "OBJECT_UPDATED" | "RELATIONSHIP_CREATED";

export interface SignedSocialEnvelope {
  type: SocialEventType;
  payload: Record<string, unknown>;
  proof: { algorithm: "ed25519"; signature: string; publicKey: string };
  metadata: Record<string, unknown>;
}

export interface EnvelopeSubmitResult {
  event_id: string;
  event_type: string;
  status: string;
}

export class EnvelopeRejectedError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(`envelope rejected [${code}]: ${message}`);
    this.name = "EnvelopeRejectedError";
    this.code = code;
  }
}

/**
 * Build a signed envelope as the given FYD dev identity. The private key is
 * loaded from FYD_DEV_KEY_DIR, used once for signing, never serialized.
 */
export function buildSignedEnvelope(
  identityId: string,
  type: SocialEventType,
  payload: Record<string, unknown>,
  extraMetadata: Record<string, unknown> = {},
): SignedSocialEnvelope {
  const metadata = {
    source: "fyd-social",
    generator: GEN,
    producedAt: new Date().toISOString(),
    ...extraMetadata,
  };
  const canonicalBytes = canonicalizeJson({ type, payload, metadata });
  const sig = signAsFydIdentity(identityId, canonicalBytes);
  return {
    type,
    payload,
    proof: {
      algorithm: "ed25519",
      signature: sig.signature,
      publicKey: sig.publicPem,
    },
    metadata,
  };
}

/** Submit a signed envelope to the PING gateway. Throws on any rejection. */
export async function submitEnvelope(
  env: SignedSocialEnvelope,
): Promise<EnvelopeSubmitResult> {
  const res = await fetch(`${fydGatewayBaseUrl()}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(env),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new EnvelopeRejectedError(
      String(body.error || `HTTP_${res.status}`),
      String(body.message || "unknown gateway rejection"),
    );
  }
  return {
    event_id: String(body.event_id || ""),
    event_type: String(body.event_type || env.type),
    status: String(body.status || "ok"),
  };
}
