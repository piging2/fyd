/**
 * (g) ADVERSARIAL: route-level tenant isolation on the real FYD HTTP seams.
 *
 * Threat model: the tenant identity comes from the ROUTE PATH (trusted,
 * server-side), never from the request body. A hostile caller acting as
 * tenant A tries to make the server serve tenant B's state by:
 *   1. Claiming a different tenant in the ask request body
 *      (siteId / tenantId / tenant keys).
 *   2. Smuggling a path-traversal tenant through the route param.
 *   3. Claiming a different tenant in the owner-overrides POST body.
 *   4. Walking out of a tenant-scoped directory via tenantScopedDir.
 *
 * What this proves:
 *  - POST /api/fyd/ask/[siteId] refuses a body tenant claim that disagrees
 *    with the route tenant with 400 tenant_mismatch BEFORE any bundle I/O;
 *    the response names the route tenant and discloses nothing of B.
 *  - An invalid route tenant (path traversal, bad slug) is refused 400
 *    before any I/O.
 *  - POST /api/fyd/objects/[objectId]/overrides refuses a mismatched body
 *    tenant claim with 400 tenant_mismatch and writes NOTHING.
 *  - tenantScopedDir refuses traversal ids; valid ids cannot escape baseDir.
 *
 * Non-goal (documented demo limitation, pinned not proven): the owner
 * overrides route derives the acting tenant from the route objectId with
 * DEMO OWNER CONTEXT (no verified owner identity). Isolation between
 * tenants is enforced; authentication between owners is not.
 */
import { NextRequest } from "next/server";
import { handleAskRequest } from "@/app/api/fyd/ask/ask-pipeline";
import { POST as overridesPost } from "@/app/api/fyd/objects/[objectId]/overrides/route";
import {
  TenantContextError,
  tenantScopedDir,
} from "@/fyd/tenant/tenant-context";
import { installDirOverrides, makeTempDir } from "./helpers";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { canonicalize } from "@/lib/ping/ask-composer";

/**
 * Seed a projection the overrides route will accept: a business-role
 * object (schema ping.social.business@1) so loadObjectView resolves,
 * with a valid meta block and graphDigest like the repo's own dumper.
 */
function seedBusinessProjection(dir: string, siteId: string): void {
  const graph = {
    objects: [
      {
        id: siteId + "-biz",
        schema: "ping.social.business@1",
        visibility: "public",
        title: "Test Business " + siteId,
        provenance: { ref: "test:seed" },
        fields: { phone: "555-0100", locality: "Testville" },
      },
    ],
    relationships: [],
  };
  const digest = createHash("sha256")
    .update(canonicalize(graph as never), "utf8")
    .digest("hex");
  const meta = {
    siteId,
    dumpedAt: "2026-09-21T00:00:00.000Z",
    dumperVersion: "tenant-boundary-test",
    baseDigest: "test",
    fixtureFileDigest: "test",
    graphDigest: digest,
    generatedAt: "2026-09-21T00:00:00.000Z",
    overlayEventIds: [],
  };
  writeFileSync(join(dir, siteId + ".json"), JSON.stringify({ graph, meta }));
}

const SECRET_B = "555-019-2837"; // tenant B's secret; must never leak to A

function postRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("route-level tenant isolation", () => {
  let dir: string;
  let restoreEnv: () => void;

  beforeEach(() => {
    dir = makeTempDir("fyd-tenant-route-");
    restoreEnv = installDirOverrides({
      FYD_OWNER_DIR: dir,
      FYD_PROJECTION_DIR: dir,
    });
    // Seed projections for both tenants so a bypass WOULD have data to leak.
    seedBusinessProjection(dir, "site-a");
    seedBusinessProjection(dir, "site-b");
  });

  afterEach(() => {
    restoreEnv();
  });

  test("ask: body tenant claim disagreeing with the route tenant is refused before any I/O", async () => {
    for (const key of ["siteId", "tenantId", "tenant"] as const) {
      const res = await handleAskRequest(
        "site-a",
        postRequest("http://localhost/api/fyd/ask/site-a", {
          [key]: "site-b",
          question: "What is the phone number?",
        }),
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.code).toBe("tenant_mismatch");
      // Served-for-route-tenant, never for the claimed tenant.
      expect(body.routeTenantId).toBe("site-a");
      // The refusal may name the refused claim, but must disclose none of
      // tenant B's data.
      expect(JSON.stringify(body)).not.toContain(SECRET_B);
    }
  });

  test("ask: path-traversal route tenant is refused before any I/O", async () => {
    const res = await handleAskRequest(
      "../site-b",
      postRequest("http://localhost/api/fyd/ask/x", {
        question: "What is the phone number?",
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(String(body.code ?? body.error)).toMatch(/invalid_tenant|tenant/i);
    expect(JSON.stringify(body)).not.toContain(SECRET_B);
  });

  test("ask: legacy flat route with no siteId fails closed", async () => {
    const res = await handleAskRequest(
      null,
      postRequest("http://localhost/api/fyd/ask", {
        question: "What is the phone number?",
      }),
    );
    expect(res.status).toBe(404);
  });

  test("overrides POST: mismatched body tenant claim is refused and nothing is written", async () => {
    const before = new Set(readdirSync(dir));
    const res = await overridesPost(
      postRequest("http://localhost/api/fyd/objects/site-a/overrides", {
        siteId: "site-b",
        stage: "propose",
        text: "Change the phone number to 555-000-0000",
      }),
      { params: Promise.resolve({ objectId: "site-a" }) },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.code).toBe("tenant_mismatch");
    expect(body.tenantId).toBe("site-a");
    // Nothing was written for either tenant.
    const after = new Set(readdirSync(dir));
    expect([...after].filter((f) => !before.has(f))).toEqual([]);
    expect(JSON.stringify(body)).not.toContain(SECRET_B);
  });

  test("overrides POST: invalid route objectId is refused before any I/O", async () => {
    const res = await overridesPost(
      postRequest("http://localhost/api/fyd/objects/x/overrides", {
        stage: "propose",
        text: "Change the phone number",
      }),
      { params: Promise.resolve({ objectId: "../../etc" }) },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.code).toBe("invalid_tenant");
  });

  test("tenantScopedDir: traversal ids are refused; valid ids cannot escape the base", () => {
    for (const evil of ["../site-b", "..", "/etc", "site-b/x", "", "SITE-A"]) {
      let err: unknown = null;
      try {
        tenantScopedDir(dir, evil);
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(TenantContextError);
      expect((err as TenantContextError).code).toBe("TENANT_CONTEXT_MISSING");
    }
    const scoped = tenantScopedDir(dir, "site-a");
    expect(scoped.startsWith(dir)).toBe(true);
    expect(scoped).not.toContain("..");
  });
});
