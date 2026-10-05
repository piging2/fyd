/** Private demo personalization, not a PING identity or canonical social graph. */
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listObjectIds } from "./view";

export type RelationshipKind = "follow" | "like";
export interface DemoRelationshipViewer { kind: "demo-session"; token: string }
export interface RelationshipState {
  scope: "demo-session";
  objectId: string;
  relationship: RelationshipKind;
  state: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}
export interface RelationshipRepository {
  read(viewer: DemoRelationshipViewer, objectId: string, kind: RelationshipKind): RelationshipState;
  set(viewer: DemoRelationshipViewer, objectId: string, kind: RelationshipKind, desired: boolean): RelationshipState;
}
export class RelationshipError extends Error {
  constructor(public code: string, message: string, public status = 400, public retryable = false) {
    super(message); this.name = "RelationshipError";
  }
}
const TOKEN = /^[a-f0-9]{64}$/;

/** One file per viewer/object/relationship: unrelated updates cannot overwrite each other.
 * Atomic exclusive lock rejects overlapping writers, including separate Node workers.
 * An orphaned lock fails closed and needs operator reconciliation; never steal it.
 * Legacy global local.json state is deliberately neither read nor migrated.
 */
export function createDemoRelationshipRepository(
  directory = process.env.FYD_RELATIONSHIPS_DIR || join(process.cwd(), "data", "fyd-relationships"),
  knownObject: (id: string) => boolean = id => listObjectIds().includes(id),
  now: () => string = () => new Date().toISOString(),
): RelationshipRepository {
  const pathFor = (viewer: DemoRelationshipViewer, objectId: string, kind: RelationshipKind) => {
    if (viewer?.kind !== "demo-session" || !TOKEN.test(viewer.token)) {
      throw new RelationshipError("VIEWER_UNSUPPORTED", "A private demo session is required.", 403);
    }
    if (!/^[a-z0-9-]+$/.test(objectId) || !knownObject(objectId)) {
      throw new RelationshipError("OBJECT_UNAVAILABLE", "This object is unavailable.", 404);
    }
    if (kind !== "follow" && kind !== "like") throw new RelationshipError("RELATIONSHIP_UNSUPPORTED", "Unsupported relationship.");
    const viewerKey = createHash("sha256").update(viewer.token).digest("hex");
    return join(directory, "demo-session", viewerKey, `${objectId}.${kind}.json`);
  };
  const readAt = (path: string, objectId: string, kind: RelationshipKind): RelationshipState => {
    let raw: string;
    try { raw = readFileSync(path, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { scope: "demo-session", objectId, relationship: kind, state: false, createdAt: null, updatedAt: null };
      throw new RelationshipError("STORAGE_UNAVAILABLE", "Your demo relationship could not be read. Try again.", 503, true);
    }
    try {
      const row = JSON.parse(raw) as RelationshipState;
      if (row.scope !== "demo-session" || row.objectId !== objectId || row.relationship !== kind || typeof row.state !== "boolean" || typeof row.createdAt !== "string" || typeof row.updatedAt !== "string") throw Error();
      return row;
    } catch { throw new RelationshipError("STORAGE_INVALID", "Your demo relationship needs repair before it can be changed.", 503, false); }
  };
  return {
    read(viewer, objectId, kind) { return readAt(pathFor(viewer, objectId, kind), objectId, kind); },
    set(viewer, objectId, kind, desired) {
      if (typeof desired !== "boolean") throw new RelationshipError("STATE_REQUIRED", "Choose the desired relationship state.");
      const path = pathFor(viewer, objectId, kind), lock = `${path}.lock`;
      let locked = false;
      const temp = `${path}.${randomBytes(8).toString("hex")}.tmp`;
      try {
        mkdirSync(join(path, ".."), { recursive: true, mode: 0o700 });
        try { mkdirSync(lock); locked = true; }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new RelationshipError("RELATIONSHIP_BUSY", "Another change is being saved. Retry this same choice.", 409, true);
          throw error;
        }
        const previous = readAt(path, objectId, kind);
        if (previous.state === desired) return previous;
        const timestamp = now();
        const next: RelationshipState = { ...previous, state: desired, createdAt: previous.createdAt ?? timestamp, updatedAt: timestamp };
        writeFileSync(temp, JSON.stringify(next) + "\n", { encoding: "utf8", mode: 0o600, flag: "wx" });
        renameSync(temp, path);
        const confirmed = readAt(path, objectId, kind);
        if (confirmed.state !== desired || confirmed.updatedAt !== timestamp) throw Error("Read-back failed");
        return confirmed;
      } catch (error) {
        if (error instanceof RelationshipError) throw error;
        throw new RelationshipError("PERSISTENCE_UNCONFIRMED", "We could not confirm that your choice was saved. Retry the same choice.", 503, true);
      } finally {
        try { rmSync(temp, { force: true }); } catch { /* Keep the original failure. */ }
        if (locked) { try { rmSync(lock, { recursive: true }); } catch { /* A stale lock fails closed. */ } }
      }
    },
  };
}
