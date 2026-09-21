/**
 * Temporary DEV signing helper for the practice BFF.
 *
 * SERVER ONLY. Never import from a client component. Private keys never
 * leave the server: they are read from PING_DEV_KEY_DIR, used to sign, and
 * never serialized into API responses, logs, or events.
 *
 * This exists only so the practice page can produce signed dev envelopes
 * until the PING runtime (Lane A) exposes a canonical signing endpoint.
 * Canonicalization authority stays with the runtime; the sorted-key JSON
 * below is a clearly labeled dev stand-in, not the constitutional path.
 */

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  createHash,
  type KeyObject,
} from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export class DevKeyDirNotConfiguredError extends Error {
  constructor() {
    super(
      "PING_DEV_KEY_DIR is not set. Set it to a directory outside the Git " +
        "working tree to hold dev Ed25519 keys (0600).",
    );
    this.name = "DevKeyDirNotConfiguredError";
  }
}

export class DevKeyNotFoundError extends Error {
  constructor(identityId: string) {
    super(
      `No dev private key found for identity "${identityId}". ` +
        "Create the identity through the practice page so a dev keypair is generated.",
    );
    this.name = "DevKeyNotFoundError";
  }
}

/** Deterministic JSON for dev envelopes: objects sorted by key, recursively. */
export function canonicalizeJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalizeJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalizeJson(v)}`);
    return `{${entries.join(",")}}`;
  }
  const s = JSON.stringify(value);
  if (s === undefined) return "null";
  return s;
}

export interface DevKeypair {
  privatePem: string;
  publicPem: string;
  /** Short fingerprint for display; never a secret. */
  fingerprint: string;
}

function fingerprintOfPublicKey(publicKey: KeyObject): string {
  const der = publicKey.export({ format: "der", type: "spki" });
  return createHash("sha256").update(der).digest("hex").slice(0, 16);
}

/** Generate a fresh Ed25519 keypair with Node native crypto. */
export function generateDevKeypair(): DevKeypair {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privatePem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const publicPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  return { privatePem, publicPem, fingerprint: fingerprintOfPublicKey(publicKey) };
}

export function devKeyDir(): string {
  const dir = process.env.PING_DEV_KEY_DIR;
  if (!dir) throw new DevKeyDirNotConfiguredError();
  return dir;
}

/** Reject path traversal: identity ids are used as directory names. */
function safeIdentityDir(identityId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9:_.-]{0,127}$/.test(identityId)) {
    throw new Error(`Refusing to resolve key path for unsafe identity id "${identityId}".`);
  }
  return join(devKeyDir(), identityId);
}

/**
 * Persist a dev keypair outside canonical state. Private key file is 0600,
 * directory is 0700. The private key never enters ping_events, projections,
 * logs, or API payloads.
 */
export function storeDevKeypair(identityId: string, kp: DevKeypair): void {
  const dir = safeIdentityDir(identityId);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const privPath = join(dir, "private.pem");
  writeFileSync(privPath, kp.privatePem, { mode: 0o600 });
  chmodSync(privPath, 0o600);
  writeFileSync(join(dir, "public.pem"), kp.publicPem, { mode: 0o600 });
  writeFileSync(
    join(dir, "metadata.json"),
    JSON.stringify(
      { identityId, fingerprint: kp.fingerprint, createdAt: new Date().toISOString(), usage: "dev-practice-only" },
      null,
      2,
    ),
    { mode: 0o600 },
  );
}

function loadDevPrivateKey(identityId: string): KeyObject {
  const privPath = join(safeIdentityDir(identityId), "private.pem");
  if (!existsSync(privPath)) throw new DevKeyNotFoundError(identityId);
  const pem = readFileSync(privPath, "utf8");
  return createPrivateKey({ key: pem, format: "pem" });
}

export interface IdentitySignature {
  signature: string;
  publicPem: string;
  fingerprint: string;
}

/** Sign canonical bytes as the given dev identity. The key never leaves. */
export function signAsIdentity(identityId: string, canonicalBytes: string): IdentitySignature {
  const privateKey = loadDevPrivateKey(identityId);
  const publicKey = createPublicKey(privateKey);
  const signature = cryptoSign(null, Buffer.from(canonicalBytes, "utf8"), privateKey);
  return {
    signature: signature.toString("base64"),
    publicPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
    fingerprint: fingerprintOfPublicKey(publicKey),
  };
}
