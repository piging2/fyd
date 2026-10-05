/** The existing FYD UUID session has no verified mapping to PING's dev social IDs.
 * Until that binding exists, these preferences are private browser-demo state.
 * A random bearer cookie scopes that state; it grants no account/capability authority.
 */
import { randomBytes } from "node:crypto";
import { SESSION_COOKIE_NAME, parseCookies } from "@/fyd/identity/session";
import { RelationshipError, type DemoRelationshipViewer } from "./relationship-repository";

export const RELATIONSHIP_COOKIE = "fyd_demo_relationships";
export function resolveRelationshipViewer(cookieHeader: string | null): DemoRelationshipViewer | null {
  let cookies: Record<string, string>;
  try { cookies = parseCookies(cookieHeader); }
  catch { throw new RelationshipError("SESSION_INVALID", "The browser session could not be read.", 400); }
  // Presence is not proof of identity. Refuse the ambiguous account/demo binding.
  if (Object.prototype.hasOwnProperty.call(cookies, SESSION_COOKIE_NAME) || Object.prototype.hasOwnProperty.call(cookies, "ping_practice_identity")) {
    throw new RelationshipError("ACCOUNT_BINDING_UNAVAILABLE", "Account relationships are not connected yet. Demo choices are not applied to your account.", 403);
  }
  const token = cookies[RELATIONSHIP_COOKIE];
  if (!token) return null;
  if (!/^[a-f0-9]{64}$/.test(token)) throw new RelationshipError("SESSION_INVALID", "The demo session is invalid. Clear its cookie to start a new demo.", 400);
  return { kind: "demo-session", token };
}
export function createRelationshipViewer(): DemoRelationshipViewer { return { kind: "demo-session", token: randomBytes(32).toString("hex") }; }
export function relationshipCookie(viewer: DemoRelationshipViewer, secure: boolean): string {
  return `${RELATIONSHIP_COOKIE}=${viewer.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secure ? "; Secure" : ""}`;
}
