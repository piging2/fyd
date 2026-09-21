/**
 * FYD dev key custody. SERVER ONLY. Never import from a client component.
 *
 * Mirrors the practice BFF's custody model (node:crypto Ed25519, keys outside
 * the git tree, private.pem 0600, directory 0700, private key never leaves
 * the server) but under FYD's own key dir (FYD_DEV_KEY_DIR) so the FYD lane
 * never shares or disturbs the practice page's keys.
 *
 * Dev identities only. Never Nolan's identity, never a real person's key.
 */

import {
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  type KeyObject,
} from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateDevKeypair } from "@/lib/ping/dev-signer";
import { fydDevKeyDir } from "./config";

export { generateDevKeypair };

export class FydKeyNotFoundError extends Error {
  constructor(identityId: string) {
    super(
      `No FYD dev private key found for identity "${identityId}". ` +
        "Mint the identity through POST /api/fyd/social/identity so a dev keypair is generated and escrowed.",
    );
    this.name = "FydKeyNotFoundError";
  }
}

/** Reject path traversal: only canonical identity ids become directory names. */
function safeIdentityDir(identityId: string): string {
  if (!/^identity_[0-9a-f]{16}$/.test(identityId)) {
    throw new Error(`Refusing to resolve key path for unsafe identity id "${identityId}".`);
  }
  return join(fydDevKeyDir(), identityId);
}

export function storeFydKeypair(
  identityId: string,
  kp: { privatePem: string; publicPem: string },
): void {
  const dir = safeIdentityDir(identityId);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const privPath = join(dir, "private.pem");
  writeFileSync(privPath, kp.privatePem, { mode: 0o600 });
  chmodSync(privPath, 0o600);
  writeFileSync(join(dir, "public.pem"), kp.publicPem, { mode: 0o600 });
}

function loadFydPrivateKey(identityId: string): KeyObject {
  const privPath = join(safeIdentityDir(identityId), "private.pem");
  if (!existsSync(privPath)) throw new FydKeyNotFoundError(identityId);
  return createPrivateKey({ key: readFileSync(privPath, "utf8"), format: "pem" });
}

export interface FydSignature {
  signature: string;
  publicPem: string;
}

/** Sign canonical bytes as the given FYD dev identity. The key never leaves. */
export function signAsFydIdentity(identityId: string, canonicalBytes: string): FydSignature {
  const privateKey = loadFydPrivateKey(identityId);
  const publicKey = createPublicKey(privateKey);
  const signature = cryptoSign(null, Buffer.from(canonicalBytes, "utf8"), privateKey);
  return {
    signature: signature.toString("base64"),
    publicPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
  };
}
