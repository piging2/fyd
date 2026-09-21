/**
 * Tests for the follows store: durable demo-local follow relationships.
 *
 * Follows must survive reload (file-backed), and malformed or unknown
 * object ids must throw a typed error without writing anything.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FollowError, isFollowing, setFollowing } from "../follows";

beforeEach(() => {
  process.env.FYD_FOLLOWS_DIR = mkdtempSync(join(tmpdir(), "fyd-follows-test-"));
  // listObjectIds() now reads the PING-backed projections; pin the test set.
  process.env.FYD_PROJECTION_DIR = join(__dirname, "fixtures", "projections");
});

function dirIsEmpty(): boolean {
  const dir = process.env.FYD_FOLLOWS_DIR as string;
  return !existsSync(dir) || readdirSync(dir).length === 0;
}

describe("setFollowing / isFollowing", () => {
  test("follow then isFollowing true", () => {
    expect(isFollowing("happy-place")).toBe(false);
    const result = setFollowing("happy-place", true);
    expect(result.following).toBe(true);
    expect(isFollowing("happy-place")).toBe(true);
  });

  test("unfollow then false", () => {
    setFollowing("happy-place", true);
    const result = setFollowing("happy-place", false);
    expect(result.following).toBe(false);
    expect(isFollowing("happy-place")).toBe(false);
  });

  test("follow is idempotent and keeps the first followedAt", () => {
    setFollowing("coppersmith-plumbing", true);
    const raw = JSON.parse(
      readFileSync(join(process.env.FYD_FOLLOWS_DIR as string, "local.json"), "utf8"),
    );
    const first = raw.following["coppersmith-plumbing"].followedAt as string;
    setFollowing("coppersmith-plumbing", true);
    const raw2 = JSON.parse(
      readFileSync(join(process.env.FYD_FOLLOWS_DIR as string, "local.json"), "utf8"),
    );
    expect(raw2.following["coppersmith-plumbing"].followedAt).toBe(first);
  });

  test("persists across re-reads", () => {
    setFollowing("happy-place", true);
    // A fresh read of the same file still sees the follow.
    expect(isFollowing("happy-place")).toBe(true);
    const raw = JSON.parse(
      readFileSync(join(process.env.FYD_FOLLOWS_DIR as string, "local.json"), "utf8"),
    );
    expect(raw.version).toBe(1);
    expect(raw.following["happy-place"].followedAt).toBeDefined();
  });
});

describe("fail closed", () => {
  test("malformed id throws and writes nothing", () => {
    expect(() => setFollowing("../evil", true)).toThrow(FollowError);
    expect(() => isFollowing("BAD ID")).toThrow(FollowError);
    expect(dirIsEmpty()).toBe(true);
  });

  test("well-formed but unknown object id throws and writes nothing", () => {
    expect(() => setFollowing("no-such-business", true)).toThrow(
      new FollowError("Unknown object."),
    );
    expect(() => isFollowing("no-such-business")).toThrow(
      new FollowError("Unknown object."),
    );
    expect(dirIsEmpty()).toBe(true);
  });

  test("a failed write does not disturb an existing follow", () => {
    setFollowing("happy-place", true);
    expect(() => setFollowing("no-such-business", true)).toThrow(FollowError);
    expect(isFollowing("happy-place")).toBe(true);
  });
});
