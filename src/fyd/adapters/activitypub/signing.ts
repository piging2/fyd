/**
 * HTTP Signature signing via Fedify.
 *
 * Fedify owns the signature plumbing (draft-cavage headers, digest, key
 * handling). This module only adapts: build the unsigned POST request for an
 * activity, hand it to Fedify's signRequest, and type the failure.
 *
 * Keys are CryptoKey objects held in memory only. Throwaway probe keys are
 * generated at runtime and never persisted or logged.
 */

import { generateCryptoKeyPair, signRequest } from "@fedify/fedify";
import { ActivityPubAdapterError } from "./types";

export interface SigningKey {
  privateKey: CryptoKey;
  /** Key id the verifier dereferences, e.g. "https://host/users/x#main-key". */
  keyId: string;
}

/**
 * Generate a throwaway RSA key pair for probing. The private key never
 * leaves this process; callers must never log or persist it.
 */
export async function generateThrowawayKey(keyId: string): Promise<SigningKey> {
  const { privateKey } = await generateCryptoKeyPair("RSASSA-PKCS1-v1_5");
  return { privateKey, keyId };
}

/**
 * Sign a POST request carrying an activity document. Returns the signed
 * Request, ready for fetch. Throws "signing_failed" on any Fedify error.
 */
export async function signActivityRequest(input: {
  url: string;
  activity: unknown;
  key: SigningKey;
}): Promise<Request> {
  const request = new Request(input.url, {
    method: "POST",
    headers: { "content-type": "application/activity+json" },
    body: JSON.stringify(input.activity),
  });
  try {
    return await signRequest(request, input.key.privateKey, new URL(input.key.keyId));
  } catch (error) {
    throw new ActivityPubAdapterError(
      "signing_failed",
      `Fedify failed to sign the request to ${input.url}`,
      String(error),
    );
  }
}
