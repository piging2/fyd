/**
 * File-backed identity binding store (server-only).
 *
 * Durable binding records live in data/fyd-identity/accounts/*.json, one
 * file per provider account, following the owner-store convention
 * (src/fyd/object/owner-store.ts): durable state in files, FYD_IDENTITY_DIR
 * env override so tests use a temp directory. Writes are atomic
 * (tmp + rename). No new tables: archaeology found no existing PING
 * authority that owns user/provider-account binding, so this FYD-scoped
 * store fills the gap without creating a new *Authority.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  IdentityBindingError,
  accountFileKey,
  type IdentityBindingStore,
  type ProviderAccount,
} from "./principal";

function storeDir(): string {
  return process.env.FYD_IDENTITY_DIR || join(process.cwd(), "data", "fyd-identity");
}

function accountsDir(): string {
  return join(storeDir(), "accounts");
}

function isAccountShape(v: unknown): v is ProviderAccount {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o["providerAccountId"] === "string" &&
    typeof o["provider"] === "string" &&
    typeof o["issuer"] === "string" &&
    typeof o["subject"] === "string" &&
    typeof o["identityId"] === "string" &&
    typeof o["linkedAt"] === "string" &&
    typeof o["lastVerifiedAt"] === "string"
  );
}

export class FileIdentityBindingStore implements IdentityBindingStore {
  private dir: string;

  constructor(dir?: string) {
    this.dir = dir || accountsDir();
  }

  private pathFor(id: string): string {
    return join(this.dir, accountFileKey(id));
  }

  getAccount(providerAccountId: string): ProviderAccount | null {
    const path = this.pathFor(providerAccountId);
    if (!existsSync(path)) return null;
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
      if (!isAccountShape(parsed)) return null;
      if (parsed.providerAccountId !== providerAccountId) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  putAccount(account: ProviderAccount): void {
    if (!account || typeof account.providerAccountId !== "string" || account.providerAccountId.length === 0) {
      throw new IdentityBindingError("INVALID_ACCOUNT", "Cannot store an account without a providerAccountId");
    }
    mkdirSync(this.dir, { recursive: true });
    const path = this.pathFor(account.providerAccountId);
    const tmp = path + ".tmp-" + process.pid;
    writeFileSync(tmp, JSON.stringify(account, null, 2) + "\n", "utf8");
    renameSync(tmp, path);
  }

  deleteAccount(providerAccountId: string): void {
    const path = this.pathFor(providerAccountId);
    if (existsSync(path)) unlinkSync(path);
  }

  listAccountsByIdentity(identityId: string): ProviderAccount[] {
    return this.scan().filter((a) => a.identityId === identityId);
  }

  findByVerifiedEmail(email: string): ProviderAccount[] {
    const needle = email.trim().toLowerCase();
    return this.scan().filter(
      (a) => a.emailVerified && a.email && a.email.trim().toLowerCase() === needle
    );
  }

  private scan(): ProviderAccount[] {
    if (!existsSync(this.dir)) return [];
    const out: ProviderAccount[] = [];
    for (const file of readdirSync(this.dir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const parsed: unknown = JSON.parse(readFileSync(join(this.dir, file), "utf8"));
        if (isAccountShape(parsed)) out.push(parsed);
      } catch {
        // skip corrupt records; never fail a read over one bad file
      }
    }
    out.sort((a, b) => (a.linkedAt < b.linkedAt ? -1 : 1));
    return out;
  }
}
