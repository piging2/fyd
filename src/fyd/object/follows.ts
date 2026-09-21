/**
 * Follows store (server-only).
 *
 * A follow is a durable PING relationship: the viewer asked to follow a
 * business circle (object). Follows live in
 * data/fyd-follows/local.json, a single file keyed by object id:
 *   { version: 1, following: { [objectId]: { followedAt: string } } }
 *
 * Demo-local viewer. Real user identity is a separate gate; this store proves the relationship shape.
 * Until identity exists there is exactly one viewer ("local"), so this
 * module never exposes other viewers and never lists all follows.
 *
 * All commands fail closed: malformed ids and unknown object ids are
 * rejected with a typed error and nothing is written.
 *
 * FYD_FOLLOWS_DIR env override exists so tests can use a temp directory.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listObjectIds } from "./view";

export class FollowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FollowError";
  }
}

interface FollowEntry {
  followedAt: string;
}

interface FollowsFile {
  version: 1;
  following: Record<string, FollowEntry>;
}

const OBJECT_ID_PATTERN = /^[a-z0-9-]+$/;

function followsDir(): string {
  const override = process.env.FYD_FOLLOWS_DIR;
  if (override) return override;
  return join(process.cwd(), "data", "fyd-follows");
}

function followsPath(): string {
  return join(followsDir(), "local.json");
}

function emptyFile(): FollowsFile {
  return { version: 1, following: {} };
}

function isValidFile(v: unknown): v is FollowsFile {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  if (r.version !== 1) return false;
  if (typeof r.following !== "object" || r.following === null) return false;
  return Object.entries(r.following as Record<string, unknown>).every(
    ([id, entry]) =>
      OBJECT_ID_PATTERN.test(id) &&
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as Record<string, unknown>).followedAt === "string",
  );
}

function readFile(): FollowsFile {
  try {
    const raw = readFileSync(followsPath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (isValidFile(parsed)) return parsed;
  } catch {
    // Missing or corrupt file: start fresh rather than crash the lane.
  }
  return emptyFile();
}

function writeFile(f: FollowsFile): void {
  const path = followsPath();
  mkdirSync(followsDir(), { recursive: true });
  const tmp = path + ".tmp";
  writeFileSync(tmp, JSON.stringify(f, null, 2) + "\n", "utf8");
  // Atomic replace so a crash can never leave a half-written file.
  renameSync(tmp, path);
}

/** Validate the id shape AND that the object is known. Throws on any failure. */
function requireKnownObjectId(objectId: string): void {
  if (!OBJECT_ID_PATTERN.test(objectId)) {
    throw new FollowError("Invalid object id.");
  }
  if (!listObjectIds().includes(objectId)) {
    throw new FollowError("Unknown object.");
  }
}

/** True when the local viewer is following the object. */
export function isFollowing(objectId: string): boolean {
  requireKnownObjectId(objectId);
  return objectId in readFile().following;
}

/**
 * Follow (following=true) or unfollow (following=false) an object.
 * Returns the new state. Unknown ids throw and nothing is written.
 */
export function setFollowing(
  objectId: string,
  following: boolean,
): { following: boolean } {
  requireKnownObjectId(objectId);
  const file = readFile();
  if (following) {
    if (!(objectId in file.following)) {
      file.following[objectId] = { followedAt: new Date().toISOString() };
      writeFile(file);
    }
  } else {
    if (objectId in file.following) {
      delete file.following[objectId];
      writeFile(file);
    }
  }
  return { following };
}
