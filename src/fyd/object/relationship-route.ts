import { NextRequest, NextResponse } from "next/server";
import { createDemoRelationshipRepository, RelationshipError, type RelationshipKind } from "./relationship-repository";
import { resolveRelationshipViewer } from "./relationship-viewer";
import { resolveRelationshipObjectId } from "./relationship-object";

export function relationshipFailure(error: unknown): NextResponse {
  const e = error instanceof RelationshipError ? error : new RelationshipError("STORAGE_UNAVAILABLE", "Your choice could not be confirmed. Try again.", 503, true);
  return NextResponse.json({ ok: false, code: e.code, error: e.message, retryable: e.retryable }, { status: e.status, headers: { "Cache-Control": "private, no-store" } });
}
export function assertSameOrigin(request: NextRequest): void {
  const origin = request.headers.get("origin"), site = request.headers.get("sec-fetch-site");
  // Compare against the Host header, not nextUrl.origin: nextUrl pins the
  // origin to localhost, which rejects legitimate same-origin requests made
  // via the machine IP or hostname (e.g. the WSL IP used to reach :3100
  // from Windows) and breaks every relationship action on the real path.
  const host = request.headers.get("host");
  const serverOrigin = host ? `${request.nextUrl.protocol}//${host}` : request.nextUrl.origin;
  if ((origin && origin !== serverOrigin) || (site && site !== "same-origin" && site !== "none")) {
    throw new RelationshipError("ORIGIN_REJECTED", "This action must start on the FYD site.", 403);
  }
}
export async function relationshipRoute(request: NextRequest, kind: RelationshipKind, mutate: boolean): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
    const viewer = resolveRelationshipViewer(request.headers.get("cookie"));
    if (!viewer) throw new RelationshipError("SESSION_REQUIRED", "Start a private demo session before changing this object.", 409, true);
    let objectId: string, desired: boolean | undefined;
    if (mutate) {
      const raw: unknown = await request.json().catch(() => null);
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new RelationshipError("BODY_INVALID", "An object with the desired relationship state is required.");
      const body = raw as Record<string, unknown>;
      objectId = typeof body?.objectId === "string" ? body.objectId : "";
      // Caller-supplied viewer identifiers never select a repository partition.
      if (body && ("viewerId" in body || "identityId" in body || "viewer" in body)) throw new RelationshipError("VIEWER_NOT_ACCEPTED", "The server determines the viewer.");
      desired = typeof body?.state === "boolean" ? body.state : body?.action === kind ? true : body?.action === `un${kind}` ? false : undefined;
      if (desired === undefined) throw new RelationshipError("STATE_REQUIRED", "A boolean state or explicit relationship action is required.");
    } else objectId = request.nextUrl.searchParams.get("objectId") ?? "";
    const storageId = resolveRelationshipObjectId(objectId);
    if (!storageId) throw new RelationshipError("OBJECT_UNAVAILABLE", "This object is unavailable.", 404);
    const repository = createDemoRelationshipRepository(undefined, id => id === storageId);
    const result = mutate ? repository.set(viewer, storageId, kind, desired!) : repository.read(viewer, storageId, kind);
    return NextResponse.json({ ok: true, ...result, objectId, [kind === "follow" ? "following" : "liked"]: result.state, persistence: "private-demo", accountConnected: false }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return relationshipFailure(error); }
}
