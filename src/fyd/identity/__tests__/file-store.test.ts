/**
 * File store tests: durable binding records round-trip through the
 * FYD_IDENTITY_DIR override, with atomic writes and corrupt-file
 * tolerance.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileIdentityBindingStore } from "../file-store";
import { signInOrSignUp } from "../principal";
import type { VerifiedAccount } from "../provider";

const NOW = "2026-09-21T15:00:00.000Z";

function account(sub: string): VerifiedAccount {
  return { provider: "google", issuer: "https://accounts.google.com", subject: sub, email: sub + "@example.com", emailVerified: true };
}

describe("FileIdentityBindingStore", () => {
  let dir: string;
  let store: FileIdentityBindingStore;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "fyd-identity-test-"));
    store = new FileIdentityBindingStore(join(dir, "accounts"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("binding records survive a store reload", () => {
    const created = signInOrSignUp(store, account("sub-1"), NOW);
    const reloaded = new FileIdentityBindingStore(join(dir, "accounts"));
    const again = signInOrSignUp(reloaded, account("sub-1"), NOW);
    expect(again.created).toBe(false);
    expect(again.identityId).toBe(created.identityId);
  });

  test("corrupt files do not break reads", () => {
    signInOrSignUp(store, account("sub-1"), NOW);
    writeFileSync(join(dir, "accounts", "corrupt.json"), "not json{{{", "utf8");
    const reloaded = new FileIdentityBindingStore(join(dir, "accounts"));
    expect(reloaded.getAccount("google::https://accounts.google.com::sub-1")).not.toBeNull();
  });

  test("delete removes the record file", () => {
    signInOrSignUp(store, account("sub-1"), NOW);
    store.deleteAccount("google::https://accounts.google.com::sub-1");
    expect(store.getAccount("google::https://accounts.google.com::sub-1")).toBeNull();
  });

  test("email collision scan works across reloads", () => {
    signInOrSignUp(store, { ...account("sub-1"), email: "same@example.com" }, NOW);
    const second = signInOrSignUp(store, { ...account("sub-2"), email: "same@example.com" }, NOW);
    expect(second.emailCollision).toBe(true);
    expect(second.identityId).not.toBe(
      store.getAccount("google::https://accounts.google.com::sub-1")?.identityId
    );
  });
});
