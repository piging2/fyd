import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { createDemoRelationshipRepository, RelationshipError, type DemoRelationshipViewer } from "../relationship-repository";
import { resolveRelationshipViewer, relationshipCookie } from "../relationship-viewer";
import { GET as getFollow, POST as postFollow } from "@/app/api/fyd/follow/route";
import { GET as getLike, POST as postLike } from "@/app/api/fyd/like/route";
import { POST as session } from "@/app/api/fyd/relationship-session/route";
import { resolveRelationshipObjectId } from "../relationship-object";
import type { VerifiedPublicProjection } from "@/fyd/sitespec/public-projection";
import { SCHEMA_ROLES } from "@/fyd/sitespec/schemas";

jest.mock("../view", () => ({ listObjectIds: () => ["happy-place", "another-business"] }));
const a: DemoRelationshipViewer = { kind: "demo-session", token: "a".repeat(64) };
const b: DemoRelationshipViewer = { kind: "demo-session", token: "b".repeat(64) };
let directory: string;
const beforeDirectory = process.env.FYD_RELATIONSHIPS_DIR;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), "fyd-private-relationships-")); process.env.FYD_RELATIONSHIPS_DIR = directory; });
afterEach(() => { rmSync(directory, { recursive: true, force: true }); if (beforeDirectory === undefined) delete process.env.FYD_RELATIONSHIPS_DIR; else process.env.FYD_RELATIONSHIPS_DIR = beforeDirectory; });
function repository() { return createDemoRelationshipRepository(directory, id => ["happy-place", "another-business"].includes(id), () => "2026-10-03T12:00:00.000Z"); }
function pathFor(viewer = a, kind = "follow") { return join(directory, "demo-session", createHash("sha256").update(viewer.token).digest("hex"), `happy-place.${kind}.json`); }
function request(kind: "follow" | "like", options: { viewer?: DemoRelationshipViewer; body?: unknown; cookie?: string; origin?: string } = {}) {
  const headers: Record<string, string> = {};
  if (options.viewer) headers.cookie = `fyd_demo_relationships=${options.viewer.token}`;
  if (options.cookie !== undefined) headers.cookie = options.cookie;
  if (options.origin) headers.origin = options.origin;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  return new NextRequest(`http://example.test/api/fyd/${kind}?objectId=happy-place`, { method: options.body === undefined ? "GET" : "POST", headers, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }) });
}

describe("private relationship repository", () => {
  test("public canonical business and slug share a key; private and unknown objects do not", () => {
    const resolve = (site: string) => site === "happy-place" ? { graph: { objects: [
      { id: "canonical-business", visibility: "public", schema: SCHEMA_ROLES.business[0] },
      { id: "related-business", visibility: "public", schema: SCHEMA_ROLES.business[0] },
      { id: "private-business", visibility: "private", schema: SCHEMA_ROLES.business[0] },
    ] } } as unknown as VerifiedPublicProjection : null;
    expect(resolveRelationshipObjectId("happy-place", resolve)).toBe("happy-place");
    expect(resolveRelationshipObjectId("canonical-business", resolve)).toBe("happy-place");
    expect(resolveRelationshipObjectId("related-business", resolve)).toBe("related-business");
    expect(resolveRelationshipObjectId("private-business", resolve)).toBeNull();
    expect(resolveRelationshipObjectId("unknown", resolve)).toBeNull();
  });
  test("separates viewers, objects and follow/like without reading legacy local.json", () => {
    writeFileSync(join(directory, "local.json"), JSON.stringify({ following: { "happy-place": true } }));
    const repo = repository();
    expect(repo.read(a, "happy-place", "follow").state).toBe(false);
    repo.set(a, "happy-place", "follow", true);
    expect(repo.read(a, "happy-place", "follow").state).toBe(true);
    expect(repo.read(a, "happy-place", "like").state).toBe(false);
    expect(repo.read(b, "happy-place", "follow").state).toBe(false);
    expect(repo.read(a, "another-business", "follow").state).toBe(false);
    expect(repository().read(a, "happy-place", "follow").state).toBe(true);
  });
  test("replaying desired state is idempotent and preserves timestamps", () => {
    const repo = repository();
    const first = repo.set(a, "happy-place", "like", true);
    const serialized = readFileSync(pathFor(a, "like"), "utf8");
    expect(repo.set(a, "happy-place", "like", true)).toEqual(first);
    expect(readFileSync(pathFor(a, "like"), "utf8")).toBe(serialized);
    const reset = repo.set(a, "happy-place", "like", false);
    expect(reset.state).toBe(false);
    expect(reset.createdAt).toBe(first.createdAt);
  });
  test("refuses an existing lock without overwriting confirmed state", () => {
    const repo = repository();
    repo.set(a, "happy-place", "follow", true);
    mkdirSync(`${pathFor()}.lock`);
    try { repo.set(a, "happy-place", "follow", false); throw Error("Expected rejection"); }
    catch (error) { expect(error).toMatchObject({ code: "RELATIONSHIP_BUSY", retryable: true, status: 409 }); }
    expect(repo.read(a, "happy-place", "follow").state).toBe(true);
    expect(readdirSync(join(pathFor(), ".."))).toContain("happy-place.follow.json.lock");
  });
  test("rejects corrupt storage instead of replacing it with an unfollowed default", () => {
    const repo = repository();
    repo.set(a, "happy-place", "follow", true);
    writeFileSync(pathFor(), "broken");
    expect(() => repo.read(a, "happy-place", "follow")).toThrow(RelationshipError);
    try { repo.set(a, "happy-place", "follow", false); throw Error("Expected rejection"); }
    catch (error) { expect(error).toMatchObject({ code: "STORAGE_INVALID", retryable: false }); }
    expect(readFileSync(pathFor(), "utf8")).toBe("broken");
  });
  test("validates viewer and object before creating files", () => {
    expect(() => repository().set({ kind: "demo-session", token: "local" }, "happy-place", "follow", true)).toThrow(RelationshipError);
    expect(() => repository().set(a, "../escape", "follow", true)).toThrow(RelationshipError);
    expect(() => repository().set(a, "missing", "follow", true)).toThrow(RelationshipError);
    expect(readdirSync(directory)).toHaveLength(0);
  });
});

describe("HTTP viewer boundary", () => {
  test("reads do not mint sessions or silently use the old global viewer", async () => {
    const response = await getFollow(request("follow"));
    expect(response.status).toBe(409);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.json()).toMatchObject({ ok: false, code: "SESSION_REQUIRED", retryable: true });
  });
  test("explicit bootstrap mints private cookie once and reuses it", async () => {
    const response = await session(new NextRequest("https://example.test/api/fyd/relationship-session", { method: "POST" }));
    expect(await response.json()).toMatchObject({ ok: true, scope: "demo-session", accountConnected: false });
    expect(response.headers.get("set-cookie")).toMatch(/fyd_demo_relationships=[a-f0-9]{64}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=2592000; Secure/);
    const reused = await session(new NextRequest("https://example.test/api/fyd/relationship-session", { method: "POST", headers: { cookie: `fyd_demo_relationships=${a.token}` } }));
    expect(reused.headers.get("set-cookie")).toBeNull();
  });
  test.each(["fyd_session=unverified", "fyd_session=", "ping_practice_identity=someone"])("account cookie presence blocks demo fallback: %s", async cookie => {
    expect(() => resolveRelationshipViewer(`${cookie}; fyd_demo_relationships=${a.token}`)).toThrow(RelationshipError);
    const response = await postFollow(request("follow", { cookie, body: { objectId: "happy-place", state: true } }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "ACCOUNT_BINDING_UNAVAILABLE", retryable: false });
    expect(readdirSync(directory)).toHaveLength(0);
  });
  test("follow and like wrappers return only the cookie-selected viewer's state", async () => {
    const saved = await postFollow(request("follow", { viewer: a, body: { objectId: "happy-place", state: true } }));
    expect(await saved.json()).toMatchObject({ ok: true, state: true, following: true, scope: "demo-session", accountConnected: false });
    expect(saved.headers.get("cache-control")).toBe("private, no-store");
    expect(await (await getFollow(request("follow", { viewer: b }))).json()).toMatchObject({ following: false });
    expect(await (await getLike(request("like", { viewer: a }))).json()).toMatchObject({ liked: false });
    expect(await (await postLike(request("like", { viewer: a, body: { objectId: "happy-place", action: "like" } }))).json()).toMatchObject({ liked: true });
    expect(await (await getLike(request("like", { viewer: b }))).json()).toMatchObject({ liked: false });
  });
  test("rejects caller viewer selection and cross-origin mutations", async () => {
    const spoof = await postFollow(request("follow", { viewer: a, body: { objectId: "happy-place", state: true, viewerId: b.token } }));
    expect(spoof.status).toBe(400);
    expect(await spoof.json()).toMatchObject({ code: "VIEWER_NOT_ACCEPTED" });
    const crossOrigin = await postFollow(request("follow", { viewer: a, origin: "https://evil.test", body: { objectId: "happy-place", state: true } }));
    expect(crossOrigin.status).toBe(403);
    expect(await crossOrigin.json()).toMatchObject({ code: "ORIGIN_REJECTED" });
    expect(readdirSync(directory)).toHaveLength(0);
  });
  test.each(["wrong", ["wrong"], 9])("malformed body fails terminally before storage: %p", async body => {
    const response = await postFollow(request("follow", { viewer: a, body }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "BODY_INVALID", retryable: false });
  });
  test("invalid browser token cannot select a path", () => {
    expect(() => resolveRelationshipViewer("fyd_demo_relationships=../local")).toThrow(RelationshipError);
    expect(relationshipCookie(a, false)).not.toContain("Secure");
  });
});
