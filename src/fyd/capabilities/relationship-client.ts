/** Private browser-demo preferences; never a claim about a signed-in account. */
export type RelationshipKind = "follow" | "like";
export type RelationshipScope = "demo-session";
export type RelationshipResult =
  | { ok: true; state: boolean; scope: RelationshipScope; createdAt: string | null; updatedAt: string | null }
  | { ok: false; code: string; message: string; retryable: boolean; scope: null };
type Failure = Extract<RelationshipResult, { ok: false }>;
type SessionResult = { ok: true } | Failure;

const failure = (code: string, message: string, retryable: boolean): Failure => ({ ok: false, code, message, retryable, scope: null });

async function request(path: string, init: RequestInit = {}): Promise<{ response: Response; body: Record<string, unknown> } | Failure> {
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 12_000);
  try {
    const response = await fetch(path, { ...init, credentials: "same-origin", cache: "no-store", signal: abort.signal });
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return failure("RESPONSE_INVALID", "The server response could not be confirmed. Try again.", true);
    return { response, body: body as Record<string, unknown> };
  } catch {
    return failure("NETWORK_UNAVAILABLE", "Your choice could not be confirmed. Check your connection and retry.", true);
  } finally { clearTimeout(timeout); }
}
function serverFailure(response: Response, body: Record<string, unknown>): Failure {
  return failure(typeof body.code === "string" ? body.code : "REQUEST_FAILED", typeof body.error === "string" ? body.error : "Your choice could not be confirmed.", typeof body.retryable === "boolean" ? body.retryable : response.status >= 500);
}

// Follow and like reads share this dependency. A page never races two first-use
// cookie responses against each other. A failed bootstrap is safe to retry.
let sessionReady = false;
let sessionPending: Promise<SessionResult> | null = null;
// Bumped every time the private demo session is invalidated (SESSION_REQUIRED).
// UI caches keyed on confirmed relationship state must drop when this changes.
let sessionGeneration = 0;
export function getRelationshipSessionGeneration(): number {
  return sessionGeneration;
}
async function ensureSession(): Promise<SessionResult> {
  if (sessionReady) return { ok: true };
  if (!sessionPending) {
    sessionPending = (async () => {
      const result = await request("/api/fyd/relationship-session", { method: "POST" });
      if ("ok" in result) return result;
      if (!result.response.ok || result.body.ok !== true) return serverFailure(result.response, result.body);
      if (result.body.scope !== "demo-session" || result.body.accountConnected !== false) return failure("SCOPE_UNSUPPORTED", "This relationship scope is not supported.", false);
      sessionReady = true;
      return { ok: true } as const;
    })().finally(() => { sessionPending = null; });
  }
  return sessionPending;
}

async function relationshipRequest(objectId: string, kind: RelationshipKind, desired?: boolean): Promise<RelationshipResult> {
  const ready = await ensureSession();
  if (!ready.ok) return ready;
  const result = await request(`/api/fyd/${kind}${desired === undefined ? `?objectId=${encodeURIComponent(objectId)}` : ""}`, desired === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ objectId, state: desired }),
  });
  if ("ok" in result) return result;
  const { response, body } = result;
  if (!response.ok || body.ok !== true) {
    if (body.code === "SESSION_REQUIRED") {
      sessionReady = false;
      sessionGeneration += 1;
    }
    return serverFailure(response, body);
  }
  if (body.scope !== "demo-session" || body.accountConnected !== false || body.objectId !== objectId || body.relationship !== kind || typeof body.state !== "boolean" || (desired !== undefined && body.state !== desired)) {
    return failure("RESPONSE_UNCONFIRMED", "The saved state could not be confirmed. Retry the same choice.", true);
  }
  return { ok: true, state: body.state, scope: "demo-session", createdAt: typeof body.createdAt === "string" ? body.createdAt : null, updatedAt: typeof body.updatedAt === "string" ? body.updatedAt : null };
}
export function readObjectRelationship(objectId: string, kind: RelationshipKind): Promise<RelationshipResult> {
  return relationshipRequest(objectId, kind);
}
/** Set a desired value, never replay a toggle: retrying is idempotent. */
export function setObjectRelationship(objectId: string, kind: RelationshipKind, desired: boolean): Promise<RelationshipResult> {
  return relationshipRequest(objectId, kind, desired);
}
