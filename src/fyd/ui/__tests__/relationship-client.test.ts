import type { RelationshipResult } from "@/fyd/capabilities/relationship-client";
import { createRelationshipController } from "../use-object-relationship";

const originalFetch = global.fetch;
const ok = (state: boolean): RelationshipResult => ({ ok: true, state, scope: "demo-session", createdAt: null, updatedAt: null });
const failed: RelationshipResult = { ok: false, code: "NETWORK_UNAVAILABLE", message: "Retry the same choice.", retryable: true, scope: null };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const row = (kind: "follow" | "like", state = false) => ({ ok: true, objectId: "happy-place", relationship: kind, state, scope: "demo-session", accountConnected: false });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
afterEach(() => { global.fetch = originalFetch; jest.resetModules(); });

describe("relationship HTTP client", () => {
  test("parallel first reads share one session bootstrap before either state request", async () => {
    const bootstrap = deferred<Response>();
    const mock = jest.fn().mockImplementation((url: string) => url.endsWith("relationship-session") ? bootstrap.promise : Promise.resolve(json(row(url.includes("/follow") ? "follow" : "like"))));
    global.fetch = mock;
    const { readObjectRelationship } = await import("@/fyd/capabilities/relationship-client");
    const follow = readObjectRelationship("happy-place", "follow");
    const like = readObjectRelationship("happy-place", "like");
    expect(mock).toHaveBeenCalledTimes(1);
    bootstrap.resolve(json({ ok: true, scope: "demo-session", accountConnected: false }));
    expect(await follow).toMatchObject({ ok: true, state: false, scope: "demo-session" });
    expect(await like).toMatchObject({ ok: true, state: false });
    expect(mock.mock.calls.filter(call => call[0].endsWith("relationship-session"))).toHaveLength(1);
    expect(mock).toHaveBeenCalledTimes(3);
    expect(mock.mock.calls.every(call => call[1].credentials === "same-origin" && call[1].cache === "no-store")).toBe(true);
  });
  test("terminal account boundary stops all relationship reads", async () => {
    const mock = jest.fn().mockResolvedValue(json({ ok: false, code: "ACCOUNT_BINDING_UNAVAILABLE", error: "Account not connected.", retryable: false }, 403));
    global.fetch = mock;
    const { readObjectRelationship } = await import("@/fyd/capabilities/relationship-client");
    expect(await readObjectRelationship("happy-place", "follow")).toMatchObject({ ok: false, retryable: false, code: "ACCOUNT_BINDING_UNAVAILABLE" });
    expect(mock).toHaveBeenCalledTimes(1);
  });
  test("mutation submits desired state and rejects an unconfirmed opposite response", async () => {
    const mock = jest.fn().mockResolvedValueOnce(json({ ok: true, scope: "demo-session", accountConnected: false })).mockResolvedValueOnce(json(row("follow", false)));
    global.fetch = mock;
    const { setObjectRelationship } = await import("@/fyd/capabilities/relationship-client");
    expect(await setObjectRelationship("happy-place", "follow", true)).toMatchObject({ ok: false, retryable: true, code: "RESPONSE_UNCONFIRMED" });
    expect(JSON.parse(mock.mock.calls[1][1].body)).toEqual({ objectId: "happy-place", state: true });
  });
  test("an expired session is re-established only on the next explicit retry", async () => {
    const mock = jest.fn()
      .mockResolvedValueOnce(json({ ok: true, scope: "demo-session", accountConnected: false }))
      .mockResolvedValueOnce(json({ ok: false, code: "SESSION_REQUIRED", error: "Session expired.", retryable: true }, 409))
      .mockResolvedValueOnce(json({ ok: true, scope: "demo-session", accountConnected: false }))
      .mockResolvedValueOnce(json(row("follow", true)));
    global.fetch = mock;
    const { setObjectRelationship } = await import("@/fyd/capabilities/relationship-client");
    expect(await setObjectRelationship("happy-place", "follow", true)).toMatchObject({ ok: false, code: "SESSION_REQUIRED" });
    expect(mock).toHaveBeenCalledTimes(2);
    expect(await setObjectRelationship("happy-place", "follow", true)).toMatchObject({ ok: true, state: true });
    expect(mock.mock.calls.filter(call => call[0].endsWith("relationship-session"))).toHaveLength(2);
  });
});

describe("relationship state and intent", () => {
  test("keeps confirmed state during save and retries the same desired value after a lost reply", async () => {
    const response = deferred<RelationshipResult>();
    const api = { read: jest.fn().mockResolvedValue(ok(false)), set: jest.fn().mockImplementationOnce(() => response.promise).mockResolvedValueOnce(ok(true)) };
    const controller = createRelationshipController("happy-place", "follow", api);
    await controller.load();
    const pending = controller.toggle();
    expect(controller.getSnapshot()).toMatchObject({ state: false, status: "pending" });
    await controller.toggle();
    expect(api.set).toHaveBeenCalledTimes(1);
    response.resolve(failed);
    await pending;
    expect(controller.getSnapshot()).toMatchObject({ state: false, status: "retryable-error" });
    await controller.toggle();
    expect(api.set).toHaveBeenCalledTimes(1);
    await controller.retry();
    expect(api.set.mock.calls).toEqual([["happy-place", "follow", true], ["happy-place", "follow", true]]);
    expect(controller.getSnapshot()).toMatchObject({ state: true, status: "success", scope: "demo-session" });
  });
  test("a failed initial read has a retry path, and terminal failures cannot mutate", async () => {
    const api = { read: jest.fn().mockResolvedValueOnce(failed).mockResolvedValueOnce(ok(true)), set: jest.fn().mockResolvedValue({ ...failed, retryable: false }) };
    const controller = createRelationshipController("happy-place", "like", api);
    await controller.load();
    expect(controller.getSnapshot()).toMatchObject({ state: null, status: "retryable-error" });
    await controller.retry();
    expect(controller.getSnapshot()).toMatchObject({ state: true, status: "ready" });
    await controller.toggle();
    expect(controller.getSnapshot()).toMatchObject({ state: true, status: "terminal-error" });
    await controller.retry(); await controller.toggle();
    expect(api.set).toHaveBeenCalledTimes(1);
  });
  test("disposing or changing objects prevents stale in-flight results from painting", async () => {
    const oldRead = deferred<RelationshipResult>();
    const api = { read: jest.fn().mockReturnValueOnce(oldRead.promise).mockResolvedValueOnce(ok(false)), set: jest.fn() };
    const controller = createRelationshipController("happy-place", "follow", api);
    const old = controller.load();
    controller.cancel();
    await controller.load();
    oldRead.resolve(ok(true)); await old;
    expect(controller.getSnapshot()).toMatchObject({ state: false, status: "ready" });
  });
});
