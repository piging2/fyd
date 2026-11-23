/**
 * D3 Option B mount, service level: the authenticated correction
 * surface (src/fyd/owner-mode/correction-surface.ts).
 *
 * The auth path under test is the production chain in fixture
 * configuration: caller key -> CallerKeyOwnerIdentityProvider -> the
 * operator-provisioned registry (a fixture registry injected through
 * the provider's own loader seam) -> credential-derived entitlement ->
 * owner-correction-intake. No demo context is involved anywhere.
 *
 * Run with: npx jest correction-surface
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CallerRegistry } from "../../../app/api/mc/_lib/mc-dispatch-identity";
import type { ObjectGraph } from "../../sitespec/types";
import { extractSiteFacts } from "../facts";
import {
  journalAssertionsMissingEvents,
  loadAssertionJournal,
} from "../owner-correction-intake";
import {
  checkCorrectionRate,
  getCorrectionRecord,
  recordCorrectionRate,
  submitCorrection,
  type CorrectionSurfaceDeps,
} from "../correction-surface";

// ---------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------

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
    "key-r2": caller("rate-2", SITE_A),
    "key-r3": caller("rate-3", SITE_A),
    "key-r4": caller("rate-4", SITE_A),
    "key-r5": caller("rate-5", SITE_A),
    "key-r6": caller("rate-6", SITE_A),
    "key-r7": caller("rate-7", SITE_A),
  },
  tenants: new Set([SITE_A, SITE_B]),
};

const T0 = Date.parse("2026-11-20T12:00:00.000Z");

interface Harness {
  deps: CorrectionSurfaceDeps;
  assertionDir: string;
  ownerDir: string;
  setNow: (ms: number) => void;
}

function makeHarness(overrides?: Partial<CorrectionSurfaceDeps>): Harness {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wp8-surface-"));
  const assertionDir = path.join(root, "assertions");
  const ownerDir = path.join(root, "owner-events");
  process.env.FYD_OWNER_DIR = ownerDir;
  let now = T0;
  const deps: CorrectionSurfaceDeps = {
    loadRegistry: () => REGISTRY,
    assertionDir,
    loadFacts: async () =>
      extractSiteFacts(GRAPH, "2026-11-20T11:00:00.000Z"),
    nowMs: () => now,
    nowIso: () => new Date(now).toISOString(),
    ...overrides,
  };
  return {
    deps,
    assertionDir,
    ownerDir,
    setNow: (ms: number) => {
      now = ms;
    },
  };
}

const PHONE_FIX = {
  objectId: "biz-1",
  field: "phone",
  value: "970-555-0199",
  sourceValueSeen: "970-555-0100",
};

// ---------------------------------------------------------------------------
// Authentication and entitlement refusals.
// ---------------------------------------------------------------------------

describe("correction surface: authentication refusals", () => {
  it("refuses a record read with no caller key (401 caller_key_required)", async () => {
    const { deps } = makeHarness();
    const res = await getCorrectionRecord({ callerKey: null, siteId: SITE_A }, deps);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(401);
      expect(res.code).toBe("caller_key_required");
    }
  });

  it("refuses a record read with an unknown caller key (401 identity_required)", async () => {
    const { deps } = makeHarness();
    const res = await getCorrectionRecord(
      { callerKey: "key-nope", siteId: SITE_A },
      deps,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(401);
      expect(res.code).toBe("identity_required");
    }
  });

  it("refuses a correction with no caller key and writes nothing", async () => {
    const { deps, assertionDir } = makeHarness();
    const res = await submitCorrection(
      { callerKey: null, siteId: SITE_A, ...PHONE_FIX },
      deps,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
    expect(loadAssertionJournal(SITE_A, assertionDir).assertions).toHaveLength(0);
  });

  it("refuses a correction with an unknown caller key and writes nothing", async () => {
    const { deps, assertionDir } = makeHarness();
    const res = await submitCorrection(
      { callerKey: "key-nope", siteId: SITE_A, ...PHONE_FIX },
      deps,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(401);
      expect(res.code).toBe("identity_required");
    }
    expect(loadAssertionJournal(SITE_A, assertionDir).assertions).toHaveLength(0);
  });
});

describe("correction surface: cross-tenant refusals at the surface", () => {
  it("refuses a record read for a tenant outside the caller's entitlement (403)", async () => {
    const { deps } = makeHarness();
    const res = await getCorrectionRecord({ callerKey: "key-b", siteId: SITE_A }, deps);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(403);
      expect(res.code).toBe("cross_tenant_denied");
    }
  });

  it("refuses a cross-tenant correction before any I/O: no journal, no rate file, no events for the refused tenant", async () => {
    const { deps, assertionDir, ownerDir } = makeHarness();
    const res = await submitCorrection(
      { callerKey: "key-a", siteId: SITE_B, ...PHONE_FIX },
      deps,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(403);
      expect(res.code).toBe("cross_tenant_denied");
    }
    expect(fs.existsSync(path.join(assertionDir, SITE_B))).toBe(false);
    expect(fs.existsSync(ownerDir)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The authenticated round-trip.
// ---------------------------------------------------------------------------

describe("correction surface: authenticated correction round-trip", () => {
  it("admits an entitled owner's contact correction through the intake write path and reads it back corrected", async () => {
    const { deps, assertionDir } = makeHarness();
    const res = await submitCorrection(
      { callerKey: "key-a", siteId: SITE_A, ...PHONE_FIX },
      deps,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.assertion.value).toBe("970-555-0199");
      expect(res.assertion.factRef.field).toBe("phone");
      expect(res.event.type).toBe("owner.corrected-fact");
    }

    // Durable journal holds exactly the one assertion, reconciled 1:1
    // with its canonical event.
    const journal = loadAssertionJournal(SITE_A, assertionDir);
    expect(journal.assertions).toHaveLength(1);
    expect(
      journalAssertionsMissingEvents(SITE_A, "biz-1", assertionDir),
    ).toEqual([]);

    // Read-back on the surface: the phone field is corrected, the
    // displaced source value is preserved on the record, and the
    // correction is in the history.
    const rec = await getCorrectionRecord(
      { callerKey: "key-a", siteId: SITE_A },
      deps,
    );
    expect(rec.ok).toBe(true);
    if (rec.ok) {
      const phone = rec.record.fields.find(
        (f) => f.objectId === "biz-1" && f.field === "phone",
      );
      expect(phone).toBeDefined();
      expect(phone?.status).toBe("corrected");
      expect(phone?.value).toBe("970-555-0199");
      expect(phone?.sourceValue).toBe("970-555-0100");
      expect(phone?.correctable).toBe(true);
      const hours = rec.record.fields.find(
        (f) => f.objectId === "biz-1" && f.field === "hours",
      );
      expect(hours?.status).toBe("observed");
      expect(hours?.correctable).toBe(false);
      expect(rec.record.history).toHaveLength(1);
      expect(rec.record.history[0].value).toBe("970-555-0199");
      expect(rec.record.actor.identityId).toBe("owner-a");
    }
  });

  it("refuses a correction addressing a fact outside the closed world (400 unknown_fact), journaling nothing", async () => {
    const { deps, assertionDir } = makeHarness();
    const res = await submitCorrection(
      {
        callerKey: "key-a",
        siteId: SITE_A,
        objectId: "biz-9",
        field: "phone",
        value: "970-555-0000",
      },
      deps,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.code).toBe("unknown_fact");
    }
    expect(loadAssertionJournal(SITE_A, assertionDir).assertions).toHaveLength(0);
  });

  it("refuses fields outside the admitted contact class (400 field_class_not_admitted), journaling nothing", async () => {
    const { deps, assertionDir } = makeHarness();
    for (const field of ["hours", "description", "name"]) {
      const res = await submitCorrection(
        {
          callerKey: "key-a",
          siteId: SITE_A,
          objectId: "biz-1",
          field,
          value: "changed",
        },
        deps,
      );
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.status).toBe(400);
        expect(res.code).toBe("field_class_not_admitted");
      }
    }
    expect(loadAssertionJournal(SITE_A, assertionDir).assertions).toHaveLength(0);
  });

  it("answers a typed tenant_not_served denial when the facts seam cannot serve the tenant", async () => {
    const { deps } = makeHarness({
      loadFacts: async () => {
        throw new Error("unknown_tenant");
      },
    });
    const res = await getCorrectionRecord(
      { callerKey: "key-a", siteId: SITE_A },
      deps,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(404);
      expect(res.code).toBe("tenant_not_served");
    }
  });
});

// ---------------------------------------------------------------------------
// Admission: the tenant-keyed rate discipline, gate at birth.
// ---------------------------------------------------------------------------

describe("correction surface: admission rate discipline", () => {
  it("refuses the (caller bound + 1)th correction in the window with 429 and records nothing for the refusal", async () => {
    const { deps, assertionDir } = makeHarness();
    const fields = ["phone", "email", "website"] as const;
    const seen: Record<string, string> = {
      phone: "970-555-0100",
      email: "hello@fixture.example",
      website: "https://fixture.example",
    };
    for (const field of fields) {
      const res = await submitCorrection(
        {
          callerKey: "key-r1",
          siteId: SITE_A,
          objectId: "biz-1",
          field,
          value: "corrected-" + field,
          sourceValueSeen: seen[field],
        },
        deps,
      );
      expect(res.ok).toBe(true);
    }
    const refused = await submitCorrection(
      {
        callerKey: "key-r1",
        siteId: SITE_A,
        objectId: "biz-1",
        field: "phone",
        value: "970-555-0111",
        sourceValueSeen: "970-555-0100",
      },
      deps,
    );
    expect(refused.ok).toBe(false);
    if (!refused.ok && refused.code === "rate_limited") {
      expect(refused.status).toBe(429);
      expect(refused.scope).toBe("caller");
      expect(refused.retryAfterMs).toBeGreaterThan(0);
      expect(refused.retryAfterMs).toBeLessThanOrEqual(3_600_000);
    } else {
      throw new Error("expected a rate_limited refusal, got " + JSON.stringify(refused));
    }
    // The refusal journaled nothing and consumed no further quota:
    // the durable ledger still shows exactly the three admissions.
    expect(loadAssertionJournal(SITE_A, assertionDir).assertions).toHaveLength(3);
    const ledger = JSON.parse(
      fs.readFileSync(
        path.join(assertionDir, SITE_A, "correction-rate.json"),
        "utf8",
      ),
    ) as { site: { count: number } };
    expect(ledger.site.count).toBe(3);
  });

  it("enforces the site bound at the ledger level across callers (20 per site per hour)", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "wp8-rate-"));
    const baseDir = path.join(root, "assertions");
    const callers = ["rate-1", "rate-2", "rate-3", "rate-4", "rate-5", "rate-6", "rate-7"];
    let admitted = 0;
    for (const c of callers) {
      for (let i = 0; i < 3 && admitted < 20; i++) {
        expect(checkCorrectionRate(SITE_A, c, T0, baseDir).ok).toBe(true);
        recordCorrectionRate(SITE_A, c, T0, baseDir);
        admitted++;
      }
    }
    expect(admitted).toBe(20);
    const verdict = checkCorrectionRate(SITE_A, "fresh-caller", T0, baseDir);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.scope).toBe("site");
    // A different tenant is unaffected, and the next window reopens.
    expect(checkCorrectionRate(SITE_B, "fresh-caller", T0, baseDir).ok).toBe(true);
    expect(
      checkCorrectionRate(SITE_A, "fresh-caller", T0 + 3_600_000, baseDir).ok,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Mount discipline pins (source scans, in the presence route-pin form).
// ---------------------------------------------------------------------------

describe("correction surface: mount discipline pins", () => {
  const surfaceSource = fs.readFileSync(
    path.join(__dirname, "..", "correction-surface.ts"),
    "utf8",
  );

  it("never imports the demo context, the demo chain, or an unscoped store", () => {
    for (const banned of [
      "overrides/owner-context",
      "DemoOwnerContext",
      "DemoIdentityProvider",
      "demo-chain",
      "object/owner-store",
    ]) {
      expect(surfaceSource).not.toContain(banned);
    }
  });

  it("writes only through the authorized intake and checks admission before it", () => {
    expect(surfaceSource).toContain("owner-correction-intake");
    const checkAt = surfaceSource.indexOf("checkCorrectionRate(");
    const intakeAt = surfaceSource.indexOf("intakeCorrection(");
    expect(checkAt).toBeGreaterThan(-1);
    expect(intakeAt).toBeGreaterThan(-1);
    expect(checkAt).toBeLessThan(intakeAt);
  });
});
