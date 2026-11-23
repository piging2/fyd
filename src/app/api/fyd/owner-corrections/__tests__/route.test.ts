/**
 * D3 Option B mount, route level: /api/fyd/owner-corrections/[siteId].
 *
 * The handler is exercised end to end with the production seams in
 * fixture configuration: the caller registry loader is replaced by a
 * fixture registry through the module seam (the production loader
 * reads the operator-provisioned registry file), and the tenant graph
 * seam returns a fixture graph. The auth code path itself (caller-key
 * provider, entitlement, intake) is the production code, unmocked.
 * Stores are isolated per test via FYD_ASSERTION_DIR / FYD_OWNER_DIR.
 *
 * Run with: npx jest owner-corrections
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { NextRequest } from "next/server";
import type { CallerRegistry } from "@/app/api/mc/_lib/mc-dispatch-identity";
import type { ObjectGraph } from "@/fyd/sitespec/types";
import { GET, POST } from "../[siteId]/route";

const SITE_A = "fixture-site";
const SITE_B = "fixture-site-b";

const GRAPH = {
  objects: [
    {
      id: "biz-1",
      fields: {
        name: "Fixture Forge",
        phone: "970-555-0100",
        email: "hello@fixture.example",
        website: "https://fixture.example",
        hours: "Mon-Fri 9-5",
      },
    },
    {
      id: "svc-1",
      fields: { name: "Welding", description: "Mobile welding and repair" },
    },
  ],
  relationships: [],
} as unknown as ObjectGraph;

function caller(agentId: string, tenant: string) {
  return {
    agent_id: agentId,
    tenant,
    entitled_tenants: [tenant],
    capabilities: [] as string[],
  };
}

const REGISTRY: CallerRegistry = {
  agents: {
    "key-a": caller("owner-a", SITE_A),
    "key-b": caller("owner-b", SITE_B),
    "key-r1": caller("rate-1", SITE_A),
  },
  tenants: new Set([SITE_A, SITE_B]),
};

jest.mock("@/app/api/mc/_lib/mc-dispatch-identity", () => {
  const actual = jest.requireActual("@/app/api/mc/_lib/mc-dispatch-identity");
  return { ...actual, loadCallerRegistry: () => REGISTRY };
});

jest.mock("@/fyd/data/fyd-tenant-graph", () => ({
  getFydTenantGraph: async (siteId: string) => {
    if (siteId !== SITE_A && siteId !== SITE_B) {
      throw new Error("unknown_tenant: " + siteId);
    }
    return { graph: GRAPH };
  },
}));

let assertionDir: string;

beforeEach(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wp8-route-"));
  assertionDir = path.join(root, "assertions");
  process.env.FYD_ASSERTION_DIR = assertionDir;
  process.env.FYD_OWNER_DIR = path.join(root, "owner-events");
});

function getReq(siteId: string, key?: string): NextRequest {
  return new NextRequest(
    "http://localhost/api/fyd/owner-corrections/" + siteId,
    { headers: key ? { "x-mc-caller-key": key } : {} },
  );
}

function postReq(siteId: string, key: string | undefined, body: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/fyd/owner-corrections/" + siteId,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(key ? { "x-mc-caller-key": key } : {}),
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
  );
}

const ctx = (siteId: string) => ({ params: Promise.resolve({ siteId }) });

const PHONE_FIX = {
  objectId: "biz-1",
  field: "phone",
  value: "970-555-0199",
  sourceValueSeen: "970-555-0100",
};

describe("GET /api/fyd/owner-corrections/[siteId]", () => {
  it("refuses an unauthenticated read: no key 401 caller_key_required, unknown key 401 identity_required", async () => {
    const noKey = await GET(getReq(SITE_A), ctx(SITE_A));
    expect(noKey.status).toBe(401);
    expect((await noKey.json()).code).toBe("caller_key_required");

    const badKey = await GET(getReq(SITE_A, "key-nope"), ctx(SITE_A));
    expect(badKey.status).toBe(401);
    expect((await badKey.json()).code).toBe("identity_required");
  });

  it("refuses a cross-tenant read with 403 cross_tenant_denied", async () => {
    const res = await GET(getReq(SITE_A, "key-b"), ctx(SITE_A));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("cross_tenant_denied");
  });

  it("serves the record view to the entitled owner: fields by status, contact class correctable", async () => {
    const res = await GET(getReq(SITE_A, "key-a"), ctx(SITE_A));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    const phone = body.fields.find(
      (f: { field: string }) => f.field === "phone",
    );
    expect(phone.status).toBe("observed");
    expect(phone.value).toBe("970-555-0100");
    expect(phone.correctable).toBe(true);
    expect(body.history).toHaveLength(0);
  });
});

describe("POST /api/fyd/owner-corrections/[siteId]", () => {
  it("refuses an unauthenticated correction with 401 and writes no tenant state", async () => {
    const res = await POST(postReq(SITE_A, undefined, PHONE_FIX), ctx(SITE_A));
    expect(res.status).toBe(401);
    expect(fs.existsSync(path.join(assertionDir, SITE_A))).toBe(false);
  });

  it("refuses a cross-tenant correction with 403 before any I/O for the target tenant", async () => {
    const res = await POST(postReq(SITE_B, "key-a", PHONE_FIX), ctx(SITE_B));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("cross_tenant_denied");
    expect(fs.existsSync(path.join(assertionDir, SITE_B))).toBe(false);
  });

  it("round-trips: an entitled owner's correction is admitted and reads back corrected on the surface", async () => {
    const res = await POST(postReq(SITE_A, "key-a", PHONE_FIX), ctx(SITE_A));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.assertionId).toBe("string");

    const read = await GET(getReq(SITE_A, "key-a"), ctx(SITE_A));
    const view = await read.json();
    const phone = view.fields.find(
      (f: { field: string }) => f.field === "phone",
    );
    expect(phone.status).toBe("corrected");
    expect(phone.value).toBe("970-555-0199");
    expect(phone.sourceValue).toBe("970-555-0100");
    expect(view.history).toHaveLength(1);
  });

  it("refuses a malformed JSON body with 400 invalid_input", async () => {
    const res = await POST(postReq(SITE_A, "key-a", "{not json"), ctx(SITE_A));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_input");
  });

  it("refuses a body missing its correction value with 400 invalid_input", async () => {
    const res = await POST(
      postReq(SITE_A, "key-a", { objectId: "biz-1", field: "phone" }),
      ctx(SITE_A),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("invalid_input");
  });

  it("refuses a field outside the admitted contact class with 400 field_class_not_admitted", async () => {
    const res = await POST(
      postReq(SITE_A, "key-a", { objectId: "biz-1", field: "hours", value: "24/7" }),
      ctx(SITE_A),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("field_class_not_admitted");
  });

  it("refuses past the caller admission bound with the 429 shape (code rate_limited, retryAfterMs)", async () => {
    const seen: Record<string, string> = {
      phone: "970-555-0100",
      email: "hello@fixture.example",
      website: "https://fixture.example",
    };
    for (const field of ["phone", "email", "website"]) {
      const res = await POST(
        postReq(SITE_A, "key-r1", {
          objectId: "biz-1",
          field,
          value: "corrected-" + field,
          sourceValueSeen: seen[field],
        }),
        ctx(SITE_A),
      );
      expect(res.status).toBe(200);
    }
    const refused = await POST(
      postReq(SITE_A, "key-r1", {
        objectId: "biz-1",
        field: "phone",
        value: "970-555-0111",
        sourceValueSeen: "970-555-0100",
      }),
      ctx(SITE_A),
    );
    expect(refused.status).toBe(429);
    const body = await refused.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("rate_limited");
    expect(body.scope).toBe("caller");
    expect(typeof body.retryAfterMs).toBe("number");
    expect(body.retryAfterMs).toBeGreaterThan(0);
  });
});
