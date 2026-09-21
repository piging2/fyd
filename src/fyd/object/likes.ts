/**
 * Likes store (server-only).
 *
 * A like is a durable PING signal: the viewer liked a business circle
 * (object). Likes live in data/fyd-likes/local.json, a single file keyed
 * by object id:
 *   { version: 1, liked: { [objectId]: { likedAt: string } } }
 *
 * Demo-local viewer. Real user identity is a separate gate; this store
 * proves the signal shape. Until identity exists there is exactly one
 * viewer ("local"), so this module never exposes other viewers and never
 * lists all likes.
 *
 * All commands fail closed: malformed ids and unknown object ids are
 * rejected with a typed error and nothing is written.
 *
 * FYD_LIKES_DIR env override exists so tests can use a temp directory.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listObjectIds } from "./view";

export class LikeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LikeError";
  }
}

interface LikeEntry {
  likedAt: string;
}

interface LikesFile {
  version: 1;
  liked: Record<string, LikeEntry>;
}

const OBJECT_ID_PATTERN = /^[a-z0-9-]+$/;

function likesDir(): string {
  const override = process.env.FYD_LIKES_DIR;
  if (override) return override;
  return join(process.cwd(), "data", "fyd-likes");
}

function likesPath(): string {
  return join(likesDir(), "local.json");
}

function emptyFile(): LikesFile {
  return { version: 1, liked: {} };
}

function isValidFile(v: unknown): v is LikesFile {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  if (r.version !== 1) return false;
  if (typeof r.liked !== "object" || r.liked === null) return false;
  return Object.entries(r.liked as Record<string, unknown>).every(
    ([k, e]) =>
      OBJECT_ID_PATTERN.test(k) &&
      typeof e === "object" &&
      e !== null &&
      typeof (e as LikeEntry).likedAt === "string",
  );
}

function readFile(): LikesFile {
  try {
    const raw = readFileSync(likesPath(), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (isValidFile(parsed)) return parsed;
    return emptyFile();
  } catch {
    return emptyFile();
  }
}

function writeFileAtomic(file: LikesFile): void {
  mkdirSync(likesDir(), { recursive: true });
  const tmp = likesPath() + ".tmp";
  writeFileSync(tmp, JSON.stringify(file, null, 2) + "\n", "utf8");
  renameSync(tmp, likesPath());
}

function assertKnownObject(objectId: string): void {
  if (!OBJECT_ID_PATTERN.test(objectId)) {
    throw new LikeError("Invalid object id.");
  }
  if (!listObjectIds().includes(objectId)) {
    throw new LikeError("Unknown object.");
  }
}

export function isLiked(objectId: string): boolean {
  assertKnownObject(objectId);
  return Object.prototype.hasOwnProperty.call(readFile().liked, objectId);
}

export function setLiked(objectId: string, liked: boolean): boolean {
  assertKnownObject(objectId);
  const file = readFile();
  if (liked) {
    if (!file.liked[objectId]) {
      file.liked[objectId] = { likedAt: new Date().toISOString() };
    }
  } else {
    delete file.liked[objectId];
  }
  writeFileAtomic(file);
  return liked;
}
