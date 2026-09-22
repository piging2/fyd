/**
 * (d) ADVERSARIAL: a projection/worker path invoked without tenant context fails closed.
 *
 * REPO LANDING PATH: src/fyd/tenant/__tests__/d-worker.test.ts
 *
 * What this proves:
 *  1. withTenantContext never executes the wrapped path when the context is
 *     missing or invalid: the spy is NOT called and a typed
 *     TenantContextError(TENANT_CONTEXT_MISSING) is thrown. This is the
 *     "background worker cannot run without tenant context" bar.
 *  2. A simulated worker job that touches the real owner store refuses to
 *     run context-less and writes nothing.
 *  3. tenantScopedDir refuses invalid/traversal tenant ids (fail closed on
 *     path construction, the privileged-path analog).
 *  4. Valid contexts pass through with the verified tenant id.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { readOverrides } from "@/fyd/object/owner-store";
import {
  TenantContextError,
  requireTenantContext,
  tenantScopedDir,
  withTenantContext,
  type TenantContext,
} from "@/fyd/tenant/tenant-context";
import { installDirOverrides, makeTempDir } from "./helpers";

describe("tenant boundary: context-less worker paths fail closed", () => {
  test("undefined context: the path never executes", () => {
    const spy = jest.fn();
    let err: unknown = null;
    try {
      withTenantContext(undefined, spy);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(TenantContextError);
    expect((err as TenantContextError).code).toBe("TENANT_CONTEXT_MISSING");
    expect(spy).not.toHaveBeenCalled();
  });

  test("null context: the path never executes", () => {
    const spy = jest.fn();
    expect(() => withTenantContext(null, spy)).toThrow(TenantContextError);
    expect(spy).not.toHaveBeenCalled();
  });

  test("empty or malformed tenant id: treated as missing context", () => {
    const spy = jest.fn();
    for (const bad of [
      { tenantId: "" },
      { tenantId: "../escape" },
      { tenantId: "SITE_A" },
      {},
      "site-a",
    ] as never[]) {
      expect(() => withTenantContext(bad, spy)).toThrow(TenantContextError);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  test("valid context: the path runs with the verified tenant id", () => {
    const spy = jest.fn((tenantId: string) => "ran:" + tenantId);
    const result = withTenantContext({ tenantId: "site-a" }, spy);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("site-a");
    expect(result).toBe("ran:site-a");
  });

  test("a worker job touching the real owner store refuses context-less runs and writes nothing", () => {
    const dir = makeTempDir("fyd-tenant-worker-");
    const restoreEnv = installDirOverrides({ FYD_OWNER_DIR: dir });
    try {
      // The worker's contract: bind context BEFORE any store call.
      const runOwnerWorkerJob = (
        ctx: TenantContext | null,
        objectId: string,
      ) => {
        const tenantId = requireTenantContext(ctx);
        if (objectId !== tenantId) {
          throw new TenantContextError(
            "CROSS_TENANT_REFERENCE",
            "Worker refused a cross-tenant reference.",
            { tenantId, attemptedKey: objectId },
          );
        }
        return readOverrides(objectId);
      };

      const worker = jest.fn(runOwnerWorkerJob);
      expect(() => worker(null, "site-a")).toThrow(TenantContextError);
      // The store read never happened: nothing was written, not even a file.
      expect(readdirSync(dir)).toEqual([]);

      const okWorker = jest.fn(runOwnerWorkerJob);
      okWorker({ tenantId: "site-a" }, "site-a");
      expect(okWorker).toHaveBeenCalledTimes(1);
    } finally {
      restoreEnv();
    }
  });

  test("tenantScopedDir: valid ids scope under the base dir; bad ids throw", () => {
    expect(tenantScopedDir("/data/fyd-owner", "site-a")).toBe(
      join("/data/fyd-owner", "site-a"),
    );
    for (const bad of ["../escape", "/abs", "SITE_A", "", "a b"]) {
      expect(() => tenantScopedDir("/data/fyd-owner", bad)).toThrow(
        TenantContextError,
      );
    }
  });
});
