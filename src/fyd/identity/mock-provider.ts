/**
 * Mock OIDC provider for tests: issues RS256 ID tokens signed by an
 * ephemeral RSA keypair and serves its own JWKS, so the real
 * verifyGoogleIdToken code path is exercised with no network and no
 * provider-console credentials.
 */

import { createPrivateKey, createPublicKey, createSign, generateKeyPairSync } from "node:crypto";
import type { FetchImpl } from "./provider";

export interface MockTokenClaims {
  sub: string;
  aud: string;
  iss?: string;
  nonce?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  exp?: number;
  iat?: number;
  kid?: string;
}

export class MockOidcProvider {
  readonly jwksUri = "https://mock-oidc.local/certs";
  private privateKeyPem: string;
  private publicJwk: Record<string, unknown>;
  readonly kid = "mock-key-1";

  constructor() {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    this.privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const jwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
    this.publicJwk = { ...jwk, kid: this.kid, alg: "RS256", use: "sig" };
  }

  jwks(): { keys: Record<string, unknown>[] } {
    return { keys: [this.publicJwk] };
  }

  /** A fetch implementation that serves the mock JWKS and token endpoint. */
  fetch: FetchImpl = (async (input: unknown, init?: unknown) => {
    const url = String(input);
    if (url === this.jwksUri) {
      return new Response(JSON.stringify(this.jwks()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error("mock fetch: unexpected URL " + url);
  }) as unknown as FetchImpl;

  issueIdToken(claims: MockTokenClaims): string {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT", kid: claims.kid ?? this.kid };
    const payload = {
      iss: "https://accounts.google.com",
      aud: claims.aud,
      sub: claims.sub,
      exp: now + 3600,
      iat: now,
      ...claims,
    };
    const signingInput =
      Buffer.from(JSON.stringify(header)).toString("base64url") +
      "." +
      Buffer.from(JSON.stringify(payload)).toString("base64url");
    const key = createPrivateKey({ key: this.privateKeyPem, format: "pem" });
    const sig = createSign("RSA-SHA256").update(signingInput, "utf8").sign(key);
    return signingInput + "." + sig.toString("base64url");
  }

  /** A token signed by a different key under an unknown kid. */
  issueForeignToken(claims: MockTokenClaims): string {
    const other = new MockOidcProvider();
    return other.issueIdToken({ ...claims, kid: "foreign-key-9" });
  }
}
