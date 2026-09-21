/**
 * Practice session: which dev PING identity the browser is acting as.
 *
 * SERVER ONLY. The session is an httpOnly cookie, so a hard refresh
 * reconstructs it from the server and private keys never touch the browser.
 *
 * The selector chooses which already-existing dev identity signs practice
 * actions. It does NOT grant capabilities: an identity can only do what the
 * PING runtime allows that identity to do.
 */

import { cookies } from "next/headers";

export const PRACTICE_IDENTITY_COOKIE = "ping_practice_identity";

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 7, // 7 days
};

export async function getPracticeIdentityId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(PRACTICE_IDENTITY_COOKIE)?.value ?? null;
}

export async function setPracticeIdentityId(identityId: string): Promise<void> {
  const jar = await cookies();
  jar.set(PRACTICE_IDENTITY_COOKIE, identityId, COOKIE_OPTIONS);
}

export async function clearPracticeIdentityId(): Promise<void> {
  const jar = await cookies();
  jar.delete(PRACTICE_IDENTITY_COOKIE);
}
