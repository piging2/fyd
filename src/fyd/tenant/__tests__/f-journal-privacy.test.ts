/**
 * Hostile tenant-privacy suite for the FYD demo journal gateway.
 *
 * Spawns the REAL gateway (tools/fyd-journal-gateway/server.mjs) on an
 * ephemeral port with a temp store, then attacks the tenant boundary in
 * both directions:
 *
 *  WRITE: spoofed tenant_id / aggregate_id / event_data.siteId, missing or
 *         invalid tenant_id  -> 400, nothing journaled.
 *  READ:  no ?tenant= -> 400 (fail closed); ?tenant=a sees only A events,
 *         ?tenant=b sees only B events. Zero cross-tenant content.
 *  RECONCILE: retry with the same request_id under the SAME tenant
 *         context -> deduped:true, the ORIGINAL event_id, no new append.
 *         Retry with the same request_id under a DIFFERENT tenant context
 *         -> 400 request_id_tenant_conflict, no new append, and the
 *         response discloses NOTHING about the original event (zero
 *         disclosure).
 *  BACKFILL: legacy records without tenant_id (siteId only) resolve to
 *         their siteId tenant in memory; the store file is never rewritten.
 *
 * Refusal is always an HTTP 400 with a typed error code, never an empty
 * 200 and never a silent store.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const GATEWAY = resolve(__dirname, "../../../../tools/fyd-journal-gateway/server.mjs");

async function freePort(): Promise<number> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const addr = s.address();
  const port = typeof addr === "object" && addr !== null ? addr.port : 0;
  await new Promise<void>((r) => s.close(() => r()));
  return port;
}

interface Gw {
  base: string;
  proc: ChildProcess;
  close: () => Promise<void>;
}

async function startGateway(store: string): Promise<Gw> {
  const port = await freePort();
  const proc = spawn("node", [GATEWAY], {
    env: {
      ...process.env,
      FYD_JOURNAL_PORT: String(port),
      FYD_JOURNAL_HOST: "127.0.0.1",
      FYD_JOURNAL_STORE: store,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const base = `http://127.0.0.1:${port}`;
  // Wait for the health route (journal identity marker) to answer.
  const deadline = Date.now() + 10000;
  for (;;) {
    try {
      const res = await fetch(base + "/");
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) {
      proc.kill();
      throw new Error("gateway did not come up on " + base);
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return {
    base,
    proc,
    close: async () => {
      proc.kill();
      await new Promise((r) => setTimeout(r, 100));
    },
  };
}

async function postEvents(gw: Gw, body: unknown): Promise<{ status: number; doc: unknown }> {
  const res = await fetch(gw.base + "/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const doc = (await res.json().catch(() => null)) as unknown;
  return { status: res.status, doc };
}

function overlayBody(tenant: string | null, siteId: string, agg: string | null, rid?: string) {
  const b: Record<string, unknown> = {
    event_type: "FYD_SITE_OVERLAY",
    event_data: { siteId, ops: [] },
  };
  if (tenant !== null) b.tenant_id = tenant;
  if (agg !== null) b.aggregate_id = agg;
  if (rid) b.request_id = rid;
  return b;
}

describe("journal gateway tenant privacy (hostile, both directions)", () => {
  let gw: Gw;
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "fyd-journal-hostile-"));
    const store = join(dir, "events.jsonl");
    // Legacy records: journaled before tenant_id existed (siteId only).
    writeFileSync(
      store,
      [
        JSON.stringify({
          event_id: "legacy-a-1",
          timestamp: "2026-09-20T00:00:00.000Z",
          event_type: "FYD_SITE_OVERLAY",
          aggregate_id: "fyd-site:tenant-a",
          event_data: { siteId: "tenant-a", ops: [] },
        }),
        JSON.stringify({
          event_id: "legacy-b-1",
          timestamp: "2026-09-20T00:00:01.000Z",
          event_type: "FYD_SITE_OVERLAY",
          aggregate_id: "fyd-site:tenant-b",
          event_data: { siteId: "tenant-b", ops: [] },
        }),
      ].join("\n") + "\n",
    );
    gw = await startGateway(store);
  }, 20000);

  afterAll(async () => {
    await gw.close();
  });

  test("honest append for A stores tenant_id and is returned", async () => {
    const { status, doc } = await postEvents(gw, overlayBody("tenant-a", "tenant-a", "fyd-site:tenant-a"));
    expect(status).toBe(200);
    expect((doc as { event_id?: string }).event_id).toMatch(/^fyd-ovl-/);
  });

  test("A->B spoof: tenant_id=a with event_data.siteId=b is refused", async () => {
    const { status, doc } = await postEvents(gw, overlayBody("tenant-a", "tenant-b", "fyd-site:tenant-a"));
    expect(status).toBe(400);
    expect((doc as { error?: string }).error).toBe("tenant_mismatch");
  });

  test("B->A spoof: tenant_id=b with event_data.siteId=a is refused", async () => {
    const { status, doc } = await postEvents(gw, overlayBody("tenant-b", "tenant-a", "fyd-site:tenant-b"));
    expect(status).toBe(400);
    expect((doc as { error?: string }).error).toBe("tenant_mismatch");
  });

  test("aggregate_id spoof: tenant_id=a with aggregate fyd-site:tenant-b is refused", async () => {
    const { status, doc } = await postEvents(gw, overlayBody("tenant-a", "tenant-a", "fyd-site:tenant-b"));
    expect(status).toBe(400);
    expect((doc as { error?: string }).error).toBe("tenant_mismatch");
  });

  test("missing tenant_id is refused, not defaulted", async () => {
    const { status, doc } = await postEvents(gw, overlayBody(null, "tenant-a", "fyd-site:tenant-a"));
    expect(status).toBe(400);
    expect((doc as { error?: string }).error).toBe("tenant_required");
  });

  test("invalid tenant_id (path traversal shape) is refused", async () => {
    const { status } = await postEvents(gw, overlayBody("../../etc", "../../etc", null));
    expect(status).toBe(400);
  });

  test("read without ?tenant= fails closed (400, not all events)", async () => {
    const res = await fetch(gw.base + "/events/FYD_SITE_OVERLAY");
    expect(res.status).toBe(400);
    const doc = (await res.json()) as { error?: string };
    expect(doc.error).toBe("tenant_required");
  });

  test("read with ?tenant= sees only that tenant's events (both directions)", async () => {
    const ra = await fetch(gw.base + "/events/FYD_SITE_OVERLAY?tenant=tenant-a").then((r) => r.json());
    const rb = await fetch(gw.base + "/events/FYD_SITE_OVERLAY?tenant=tenant-b").then((r) => r.json());
    const idsA = (ra.events as { event_id: string; event_data: { siteId: string } }[]).map((e) => e.event_id);
    const idsB = (rb.events as { event_id: string; event_data: { siteId: string } }[]).map((e) => e.event_id);
    // No event id appears on both sides: zero cross-tenant content.
    expect(idsA.filter((id) => idsB.includes(id))).toEqual([]);
    expect(idsA).toContain("legacy-a-1");
    expect(idsB).toContain("legacy-b-1");
    expect(idsA).not.toContain("legacy-b-1");
    expect(idsB).not.toContain("legacy-a-1");
    // Every returned event actually belongs to the requested tenant.
    for (const e of ra.events as { event_data: { siteId: string } }[]) {
      expect(e.event_data.siteId).toBe("tenant-a");
    }
    for (const e of rb.events as { event_data: { siteId: string } }[]) {
      expect(e.event_data.siteId).toBe("tenant-b");
    }
  });

  test("legacy records without tenant_id resolve to their siteId tenant", async () => {
    const ra = await fetch(gw.base + "/events/FYD_SITE_OVERLAY?tenant=tenant-a").then((r) => r.json());
    const rec = (ra.events as { event_id: string; tenant_id: string }[]).find(
      (e) => e.event_id === "legacy-a-1",
    );
    expect(rec).toBeDefined();
    expect(rec!.tenant_id).toBe("tenant-a");
  });

  test("retry with same request_id under the same tenant context is idempotent", async () => {
    const first = await postEvents(gw, overlayBody("tenant-a", "tenant-a", "fyd-site:tenant-a", "rid-ctx-same-1"));
    expect(first.status).toBe(200);
    const e1 = (first.doc as { event_id: string }).event_id;
    // Same request_id, same tenant: idempotent replay of the original.
    const second = await postEvents(gw, overlayBody("tenant-a", "tenant-a", "fyd-site:tenant-a", "rid-ctx-same-1"));
    expect(second.status).toBe(200);
    expect((second.doc as { deduped: boolean }).deduped).toBe(true);
    expect((second.doc as { event_id: string }).event_id).toBe(e1);
  });

  test("retry with same request_id under a different tenant context is rejected with zero disclosure", async () => {
    const first = await postEvents(gw, overlayBody("tenant-a", "tenant-a", "fyd-site:tenant-a", "rid-ctx-switch-1"));
    expect(first.status).toBe(200);
    const e1 = (first.doc as { event_id: string }).event_id;
    // Same request_id, now presented with tenant B's context.
    const second = await postEvents(gw, overlayBody("tenant-b", "tenant-b", "fyd-site:tenant-b", "rid-ctx-switch-1"));
    expect(second.status).toBe(400);
    expect((second.doc as { error: string }).error).toBe("request_id_tenant_conflict");
    // Zero disclosure: the original event_id must not leak into the response.
    expect(JSON.stringify(second.doc)).not.toContain(e1);
    // No new event was journaled for B by the retry.
    const rb = await fetch(gw.base + "/events/FYD_SITE_OVERLAY?tenant=tenant-b").then((r) => r.json());
    const idsB = (rb.events as { event_id: string }[]).map((e) => e.event_id);
    expect(idsB.filter((id) => id !== "legacy-b-1")).toEqual([]);
  });
});
