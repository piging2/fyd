/**
 * D3 Option B mount, acceptance proof at the harness rung (checklist
 * item 6, one rung above the B6-R fixture exercise):
 *
 * - a fixture owner, authenticated through the mount's real auth path
 *   in fixture configuration (caller key -> registry -> entitlement ->
 *   intake, exercised through the mounted route handler), edits a
 *   fixture tenant's record on the mounted surface;
 * - the edit persists and reads back on the surface, with the
 *   displaced source value preserved;
 * - a second fixture tenant's record is unreachable from the first
 *   owner's session: the cross-tenant write is refused before I/O at
 *   the surface, not only at the store seam, and no state exists for
 *   the refused tenant afterward;
 * - a full re-extraction and recomposition after the edit preserves
 *   the correction, in the B7 form: fresh facts at a later extraction
 *   clock, the journal replayed over them, the correction holds, no
 *   other fact changes against the no-correction control, and the
 *   corrections record itself is byte-identical across the
 *   recomposition.
 *
 * No browser leg is claimed by this proof; that rung belongs to a
 * later acceptance with Website/T3 instruments.
 *
 * Run with: npx jest owner-corrections/__tests__/acceptance
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { NextRequest } from "next/server";
import type { CallerRegistry } from "@/app/api/mc/_lib/mc-dispatch-identity";
import { extractSiteFacts } from "@/fyd/owner-mode/facts";
import {
  journalAssertionsMissingEvents,
  projectSiteFacts,
} from "@/fyd/owner-mode/owner-correction-intake";
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wp8-accept-"));
  assertionDir = path.join(root, "assertions");
  process.env.FYD_ASSERTION_DIR = assertionDir;
  process.env.FYD_OWNER_DIR = path.join(root, "owner-events");
});

const ctx = (siteId: string) => ({ params: Promise.resolve({ siteId }) });

function req(siteId: string, key: string, body?: unknown): NextRequest {
  return new NextRequest(
    "http://localhost/api/fyd/owner-corrections/" + siteId,
    body === undefined
      ? { headers: { "x-mc-caller-key": key } }
      : {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-mc-caller-key": key,
          },
          body: JSON.stringify(body),
        },
  );
}

describe("D3 Option B acceptance proof (harness rung)", () => {
  it("fixture owner corrects through the mount; the correction persists, reads back, refuses cross-tenant, and survives recomposition", async () => {
    // 1. The fixture owner edits the fixture tenant's phone on the
    //    mounted surface, through the real auth path.
    const post = await POST(
      req(SITE_A, "key-a", {
        objectId: "biz-1",
        field: "phone",
        value: "970-555-0199",
        sourceValueSeen: "970-555-0100",
      }),
      ctx(SITE_A),
    );
    expect(post.status).toBe(200);

    // 2. The edit persists and reads back on the surface; the
    //    displaced source value is preserved on the record.
    const read = await GET(req(SITE_A, "key-a"), ctx(SITE_A));
    const view = await read.json();
    const phone = view.fields.find(
      (f: { field: string }) => f.field === "phone",
    );
    expect(phone.status).toBe("corrected");
    expect(phone.value).toBe("970-555-0199");
    expect(phone.sourceValue).toBe("970-555-0100");
    expect(view.history).toHaveLength(1);

    // The journal and the canonical event log reconcile 1:1.
    expect(
      journalAssertionsMissingEvents(SITE_A, "biz-1", assertionDir),
    ).toEqual([]);

    // 3. The second fixture tenant is unreachable from the first
    //    owner's session: read and write both refused at the surface,
    //    and no state of any kind exists for the refused tenant.
    const crossRead = await GET(req(SITE_B, "key-a"), ctx(SITE_B));
    expect(crossRead.status).toBe(403);
    const crossPost = await POST(
      req(SITE_B, "key-a", {
        objectId: "biz-1",
        field: "phone",
        value: "970-555-6666",
        sourceValueSeen: "970-555-0100",
      }),
      ctx(SITE_B),
    );
    expect(crossPost.status).toBe(403);
    expect(fs.existsSync(path.join(assertionDir, SITE_B))).toBe(false);

    // 4. Recomposition in the B7 form: fresh extraction at a later
    //    clock (a source refresh), journal replayed over the fresh
    //    facts. The correction holds; against the no-correction
    //    control every other fact is identical; the corrections
    //    record is byte-identical across the recomposition.
    const journalFile = path.join(assertionDir, SITE_A, "assertions.json");
    const journalBefore = fs.readFileSync(journalFile, "utf8");

    const freshFacts = extractSiteFacts(GRAPH, "2026-11-21T09:00:00.000Z");
    const projected = projectSiteFacts(freshFacts, SITE_A, assertionDir);
    const control = projectSiteFacts(freshFacts, SITE_A, path.join(assertionDir, "empty"));

    const projectedPhone = projected.facts.find(
      (f) => f.objectId === "biz-1" && f.field === "phone",
    );
    expect(projectedPhone?.value).toBe("970-555-0199");

    const controlById = new Map(control.facts.map((f) => [f.factId, f]));
    for (const f of projected.facts) {
      if (f.objectId === "biz-1" && f.field === "phone") continue;
      expect(f.value).toBe(controlById.get(f.factId)?.value);
    }
    expect(projected.conflicts).toHaveLength(0);
    expect(fs.readFileSync(journalFile, "utf8")).toBe(journalBefore);
  });
});
