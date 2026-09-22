/**
 * e-scoped-stores.test.ts: adversarial tests against the ACTUAL scoped
 * runtime entry points (../scoped-stores.ts), both directions.
 *
 * These do NOT replace the lane-T contract tests (a-d): they prove the
 * real scoped wrappers refuse cross-tenant access BEFORE the underlying
 * store's I/O executes. Refusal is a typed TenantContextError, never
 * null, [], or a successful-looking empty result.
 */
import { TenantContextError } from "../tenant-context";
import {
  scopedAnswerAskFyd,
  scopedApplyOwnerCommand,
  scopedEmitOverlayEvent,
  scopedGetProjection,
  scopedReadOverrides,
} from "../scoped-stores";
import { installDirOverrides, makeTempDir, seedProjection } from "./helpers";

const A = { tenantId: "site-a" };
const B = { tenantId: "site-b" };

function expectRefusal(fn: () => unknown, code: "TENANT_CONTEXT_MISSING" | "CROSS_TENANT_REFERENCE") {
  let err: unknown = null;
  try {
    fn();
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(TenantContextError);
  expect((err as TenantContextError).code).toBe(code);
}

describe("scoped runtime entry points (real wrappers)", () => {
  let dir: string;
  let restoreEnv: () => void;

  beforeEach(() => {
    dir = makeTempDir("fyd-tenant-scoped-");
    restoreEnv = installDirOverrides({
      FYD_OWNER_DIR: dir,
      FYD_PROJECTION_DIR: dir,
    });
  });

  afterEach(() => {
    restoreEnv();
  });

  test("A cannot read B's overrides; B cannot read A's overrides (refused before I/O)", () => {
    // Seed B's secret through the real public API under B's context.
    scopedApplyOwnerCommand(
      B,
      "site-b",
      { type: "set-contact-field", field: "phone", value: "555-019-2837" },
      [],
      new Map(),
      { actorLabel: "tenant-boundary-test" },
    );
    expectRefusal(() => scopedReadOverrides(A, "site-b"), "CROSS_TENANT_REFERENCE");
    expectRefusal(() => scopedReadOverrides(B, "site-a"), "CROSS_TENANT_REFERENCE");
    // Same-tenant read works.
    const read = scopedReadOverrides(B, "site-b");
    expect(read).toBeDefined();
  });

  test("A cannot patch B's overrides; B cannot patch A's overrides", () => {
    const cmd = { type: "set-contact-field", field: "phone", value: "555-0000" } as const;
    expectRefusal(
      () => scopedApplyOwnerCommand(A, "site-b", cmd, [], new Map()),
      "CROSS_TENANT_REFERENCE",
    );
    expectRefusal(
      () => scopedApplyOwnerCommand(B, "site-a", cmd, [], new Map()),
      "CROSS_TENANT_REFERENCE",
    );
  });

  test("A cannot load B's projection; B cannot load A's projection (refused before I/O)", () => {
    seedProjection(dir, "site-a");
    seedProjection(dir, "site-b");
    // The refusal must be the tenant boundary, not a loader error: use a
    // site id with NO projection file for the cross-tenant direction and
    // assert the error is still CROSS_TENANT_REFERENCE (loader never ran).
    expectRefusal(() => scopedGetProjection(A, "no-such-tenant"), "CROSS_TENANT_REFERENCE");
    expectRefusal(() => scopedGetProjection(A, "site-b"), "CROSS_TENANT_REFERENCE");
    expectRefusal(() => scopedGetProjection(B, "site-a"), "CROSS_TENANT_REFERENCE");
    // Same-tenant load works.
    const proj = scopedGetProjection(A, "site-a");
    expect(proj.meta.siteId).toBe("site-a");
  });

  test("projection meta.siteId mismatch refuses even under the right context", () => {
    seedProjection(dir, "site-a", { metaSiteId: "site-b" });
    expectRefusal(() => scopedGetProjection(A, "site-a"), "CROSS_TENANT_REFERENCE");
  });

  test("A cannot Ask FYD over B's bundle; B cannot Ask FYD over A's bundle", () => {
    const loadBundle = jest.fn(() => null);
    const deps = { loadBundle };
    expectRefusal(
      () => scopedAnswerAskFyd(A, { siteId: "site-b", question: "q", mode: "visitor" }, deps),
      "CROSS_TENANT_REFERENCE",
    );
    expectRefusal(
      () => scopedAnswerAskFyd(B, { siteId: "site-a", question: "q", mode: "visitor" }, deps),
      "CROSS_TENANT_REFERENCE",
    );
    expect(loadBundle).not.toHaveBeenCalled();
  });

  test("contextless scoped execution is refused", () => {
    expectRefusal(() => scopedReadOverrides(null as never, "site-a"), "TENANT_CONTEXT_MISSING");
    expectRefusal(
      () => scopedApplyOwnerCommand(undefined as never, "site-a", { type: "noop" } as never, [], new Map()),
      "TENANT_CONTEXT_MISSING",
    );
    expectRefusal(() => scopedGetProjection({} as never, "site-a"), "TENANT_CONTEXT_MISSING");
  });

  test("A cannot record an approval for B; the gateway is never reached", async () => {
    const ops = [] as never[];
    await expect(scopedEmitOverlayEvent(A, "site-b", ops)).rejects.toMatchObject({
      code: "CROSS_TENANT_REFERENCE",
    });
    await expect(scopedEmitOverlayEvent(B, "site-a", ops)).rejects.toMatchObject({
      code: "CROSS_TENANT_REFERENCE",
    });
    await expect(scopedEmitOverlayEvent(null as never, "site-a", ops)).rejects.toMatchObject({
      code: "TENANT_CONTEXT_MISSING",
    });
  });

  test("same-tenant approval passes the tenant gate (gateway absence is a downstream error)", async () => {
    // No gateway listens in unit tests: point the emit at a dead port so no
    // real event is recorded. The honest assertion: the tenant gate passes
    // and the failure is the gateway's own unreachable error, NOT a tenant
    // refusal.
    const prev = process.env.FYD_CUSTOMIZE_GATEWAY_URL;
    process.env.FYD_CUSTOMIZE_GATEWAY_URL = "http://127.0.0.1:1/events";
    try {
      await expect(scopedEmitOverlayEvent(A, "site-a", [])).rejects.toThrow(
        /demo gateway unreachable/,
      );
    } finally {
      if (prev === undefined) delete process.env.FYD_CUSTOMIZE_GATEWAY_URL;
      else process.env.FYD_CUSTOMIZE_GATEWAY_URL = prev;
    }
  });
});
