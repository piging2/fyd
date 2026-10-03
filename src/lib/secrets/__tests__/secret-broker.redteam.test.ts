/**
 * Lane L red-team suite for the PING Secret Broker (jest).
 * Run: npx jest --config src/lib/secrets/jest.config.cjs
 *
 * Every test asserts the SECRET BOUNDARY: the secret value must never appear
 * in agent-visible context, logs, audit records, or observations.
 */
import {
  SecretBroker,
  BrokerError,
  type CredentialStore,
  MAX_TTL_SECONDS,
} from "../secret-broker";

const CANARY = "CANARY_SECRET_VALUE_9f8e7d6c5b4a"; // planted "real" secret
const CRED_ID = "TEST_CONNECTOR_TOKEN";
const SEAM = "connector-runtime-seam-1";
const PRINCIPAL = "connector:github:svc-1";

class MapStore implements CredentialStore {
  private m = new Map<string, string>();
  failGet = false;
  get(id: string): string | undefined {
    if (this.failGet) return undefined;
    return this.m.get(id);
  }
  set(id: string, v: string): void {
    this.m.set(id, v);
  }
  has(id: string): boolean {
    return this.m.has(id);
  }
}

function brokerWith(store?: MapStore, now?: () => number) {
  const s = store ?? new MapStore();
  s.set(CRED_ID, CANARY);
  return {
    store: s,
    broker: new SecretBroker({
      authorize: ({ principal, operation, target, tenantId }) =>
        principal === PRINCIPAL &&
        operation === "fetch:issues" &&
        target === "github.com/ping-org/demo" &&
        tenantId === "tenant-acme",
      store: s,
      now,
      audiences: [SEAM],
    }),
  };
}

const SCOPE = {
  principal: PRINCIPAL,
  operation: "fetch:issues",
  target: "github.com/ping-org/demo",
  tenantId: "tenant-acme",
  audience: SEAM,
};

/** Fail the test if the canary appears anywhere in agent-visible surfaces. */
function expectNoCanary(...surfaces: unknown[]) {
  for (const surface of surfaces) {
    const text = JSON.stringify(surface);
    expect(text.includes(CANARY)).toBe(false);
  }
}

describe("issuance", () => {
  it("denies by default when the policy port denies", () => {
    const { broker } = brokerWith();
    expect(() =>
      broker.request({ ...SCOPE, operation: "delete:everything", credentialId: CRED_ID }),
    ).toThrow(expect.objectContaining({ code: "PERMISSION_DENIED" }));
  });

  it("confused deputy: principal cannot mint a broader handle than policy allows", () => {
    const { broker } = brokerWith();
    expect(() =>
      broker.request({
        principal: PRINCIPAL,
        tenantId: "tenant-acme",
        operation: "write:issues",
        target: "github.com/ping-org/demo",
        audience: SEAM,
        credentialId: CRED_ID,
      }),
    ).toThrow(expect.objectContaining({ code: "PERMISSION_DENIED" }));
    expect(() =>
      broker.request({
        principal: PRINCIPAL,
        tenantId: "tenant-acme",
        operation: "fetch:issues",
        target: "github.com/other-org/other",
        audience: SEAM,
        credentialId: CRED_ID,
      }),
    ).toThrow(expect.objectContaining({ code: "PERMISSION_DENIED" }));
  });

  it("caps TTL at the hard ceiling", async () => {
    let t = 1_700_000_000_000;
    const { broker } = brokerWith(undefined, () => t);
    const h = broker.request({ ...SCOPE, credentialId: CRED_ID, ttlSeconds: 999_999 });
    t += MAX_TTL_SECONDS * 1000 + 1;
    await expect(broker.execute(h, SCOPE, async () => "x")).rejects.toThrow(
      expect.objectContaining({ code: "EXPIRED" }),
    );
  });

  it("handle format is opaque and non-guessable", () => {
    const { broker } = brokerWith();
    const a = broker.request({ ...SCOPE, credentialId: CRED_ID });
    const b = broker.request({ ...SCOPE, credentialId: CRED_ID });
    expect(a.startsWith("pingsec_1_")).toBe(true);
    expect(a).not.toBe(b);
    expect(a.includes(CANARY) || a.includes(CRED_ID)).toBe(false);
  });
});

describe("execution scope binding", () => {
  it("replay outside scope: wrong operation is rejected", async () => {
    const { broker } = brokerWith();
    const h = broker.request({ ...SCOPE, credentialId: CRED_ID });
    await expect(
      broker.execute(h, { ...SCOPE, operation: "fetch:admin" }, async (s) => s),
    ).rejects.toThrow(expect.objectContaining({ code: "PERMISSION_DENIED" }));
  });

  it("cross-tenant: different principal is rejected", async () => {
    const { broker } = brokerWith();
    const h = broker.request({ ...SCOPE, credentialId: CRED_ID });
    await expect(
      broker.execute(h, { ...SCOPE, principal: "connector:github:svc-2" }, async (s) => s),
    ).rejects.toThrow(expect.objectContaining({ code: "PERMISSION_DENIED" }));
  });

  it("cross-tenant: different tenantId is rejected even for the same principal", async () => {
    const { broker } = brokerWith();
    const h = broker.request({ ...SCOPE, credentialId: CRED_ID });
    await expect(
      broker.execute(h, { ...SCOPE, tenantId: "tenant-evil" }, async (s) => s),
    ).rejects.toThrow(expect.objectContaining({ code: "PERMISSION_DENIED" }));
  });

  it("wrong audience (seam) is rejected — stolen handle is useless elsewhere", async () => {
    const { broker } = brokerWith();
    const h = broker.request({ ...SCOPE, credentialId: CRED_ID });
    await expect(
      broker.execute(h, { ...SCOPE, audience: "attacker-seam" }, async (s) => s),
    ).rejects.toThrow(expect.objectContaining({ code: "PERMISSION_DENIED" }));
  });

  it("expired handle is rejected", async () => {
    let t = 1_700_000_000_000;
    const { broker } = brokerWith(undefined, () => t);
    const h = broker.request({ ...SCOPE, credentialId: CRED_ID, ttlSeconds: 60 });
    t += 61_000;
    await expect(broker.execute(h, SCOPE, async () => "x")).rejects.toThrow(
      expect.objectContaining({ code: "EXPIRED" }),
    );
  });

  it("unknown handle is rejected", async () => {
    const { broker } = brokerWith();
    await expect(broker.execute("pingsec_1_forged", SCOPE, async () => "x")).rejects.toThrow(
      expect.objectContaining({ code: "AUTH_REQUIRED" }),
    );
  });

  it("single-use default: second execution is rejected", async () => {
    const { broker } = brokerWith();
    const h = broker.request({ ...SCOPE, credentialId: CRED_ID });
    await broker.execute(h, SCOPE, async () => "first");
    await expect(broker.execute(h, SCOPE, async () => "second")).rejects.toThrow(
      expect.objectContaining({ code: "PERMISSION_DENIED" }),
    );
  });

  it("revoked handle is rejected", async () => {
    const { broker } = brokerWith();
    const h = broker.request({ ...SCOPE, credentialId: CRED_ID });
    broker.revoke(h);
    await expect(broker.execute(h, SCOPE, async () => "x")).rejects.toThrow(
      expect.objectContaining({ code: "PERMISSION_DENIED" }),
    );
  });

  it("revokeAll kills every outstanding handle for the principal", async () => {
    const { broker } = brokerWith();
    const h1 = broker.request({ ...SCOPE, credentialId: CRED_ID });
    const h2 = broker.request({ ...SCOPE, credentialId: CRED_ID, maxUses: 5 });
    expect(broker.revokeAll(PRINCIPAL)).toBe(2);
    await expect(broker.execute(h1, SCOPE, async () => "x")).rejects.toThrow();
    await expect(broker.execute(h2, SCOPE, async () => "x")).rejects.toThrow();
  });

  it("unreachable secret backend fails closed WITHOUT running the work", async () => {
    const store = new MapStore();
    const { broker } = brokerWith(store);
    const h = broker.request({ ...SCOPE, credentialId: CRED_ID });
    store.failGet = true;
    let ran = false;
    await expect(
      broker.execute(h, SCOPE, async () => {
        ran = true;
        return "x";
      }),
    ).rejects.toThrow(expect.objectContaining({ code: "SOURCE_UNAVAILABLE" }));
    expect(ran).toBe(false);
  });
});

describe("attenuation", () => {
  it("can narrow ttl/uses but never broaden scope or time", async () => {
    const { broker } = brokerWith();
    const parent = broker.request({ ...SCOPE, credentialId: CRED_ID, ttlSeconds: 600, maxUses: 5 });
    const child = broker.attenuate(parent, { ttlSeconds: 60, maxUses: 1 });
    expect(child).not.toBe(parent);
    await expect(broker.execute(child, SCOPE, async () => "ok")).resolves.toBe("ok");
  });

  it("cannot attenuate an expired parent", () => {
    let t = 1_700_000_000_000;
    const { broker } = brokerWith(undefined, () => t);
    const parent = broker.request({ ...SCOPE, credentialId: CRED_ID, ttlSeconds: 60 });
    t += 61_000;
    expect(() => broker.attenuate(parent, { ttlSeconds: 30 })).toThrow(
      expect.objectContaining({ code: "EXPIRED" }),
    );
  });
});

describe("rotation", () => {
  it("unexecuted handles resolve the NEW value; executed handles are sealed", async () => {
    const { broker } = brokerWith();
    const h1 = broker.request({ ...SCOPE, credentialId: CRED_ID });
    await broker.execute(h1, SCOPE, async (s) => {
      expect(s).toBe(CANARY);
      return "done";
    });
    const h2 = broker.request({ ...SCOPE, credentialId: CRED_ID });
    broker.rotate(CRED_ID, "ROTATED_VALUE_abcdef1234");
    const seen = await broker.execute(h2, SCOPE, async (s) => s);
    expect(seen).toBe("ROTATED_VALUE_abcdef1234");
    expect(JSON.stringify(broker.auditTrail()).includes("ROTATED_VALUE_abcdef1234")).toBe(false);
    expect(JSON.stringify(broker.auditTrail()).includes(CANARY)).toBe(false);
  });
});


describe("renewal", () => {
  it("extends a live lease with full scope re-check", () => {
    let t = 1_700_000_000_000;
    const { broker } = brokerWith(undefined, () => t);
    const h = broker.request({ ...SCOPE, credentialId: CRED_ID, ttlSeconds: 60 });
    t += 50_000;
    broker.renew(h, SCOPE, 60);
    t += 50_000; // past original expiry, inside renewal
    return expect(broker.execute(h, SCOPE, async () => "ok")).resolves.toBe("ok");
  });

  it("renewal beyond max total lease lifetime is denied", () => {
    let t = 1_700_000_000_000;
    const { broker } = brokerWith(undefined, () => t);
    const h = broker.request({ ...SCOPE, credentialId: CRED_ID, ttlSeconds: 900, maxUses: 500 });
    // walk the lease forward near the 24h cap
    for (let i = 0; i < 95; i++) {
      t += 900_000;
      broker.renew(h, SCOPE, 900);
    }
    // t is still inside the lease; one more 900s extension would breach the 24h cap
    expect(() => broker.renew(h, SCOPE, 900)).toThrow(
      expect.objectContaining({ code: "PERMISSION_DENIED" }),
    );
  });

  it("renewal of an expired handle is denied", () => {
    let t = 1_700_000_000_000;
    const { broker } = brokerWith(undefined, () => t);
    const h = broker.request({ ...SCOPE, credentialId: CRED_ID, ttlSeconds: 60 });
    t += 61_000;
    expect(() => broker.renew(h, SCOPE, 60)).toThrow(
      expect.objectContaining({ code: "EXPIRED" }),
    );
  });

  it("renewal with mismatched tenant is denied", () => {
    const { broker } = brokerWith();
    const h = broker.request({ ...SCOPE, credentialId: CRED_ID, maxUses: 5 });
    expect(() => broker.renew(h, { ...SCOPE, tenantId: "tenant-evil" }, 60)).toThrow(
      expect.objectContaining({ code: "PERMISSION_DENIED" }),
    );
  });
});

describe("seam error masking (RT-1)", () => {
  it("provider error echoing the secret never crosses the seam", async () => {
    const { broker } = brokerWith();
    const h = broker.request({ ...SCOPE, credentialId: CRED_ID });
    let caught: unknown;
    try {
      await broker.execute(h, SCOPE, async (secret) => {
        // provider 401 echoing the key, plus a .cause chain carrying it
        const cause = new Error(`refresh token ${secret} rejected`);
        throw new Error(`401 unauthorized: bad api key ${secret}`, { cause } as never);
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BrokerError);
    expect((caught as BrokerError).code).toBe("TRANSIENT");
    expectNoCanary(caught, (caught as Error).message, (caught as Error).stack);
    const audit = broker.auditTrail();
    expectNoCanary(audit);
    expect(audit.some((r) => r.event === "executed" && r.outcome === "TRANSIENT")).toBe(true);
  });
});

describe("secret boundary (the whole point)", () => {
  it("end-to-end agent fetch: secret never in agent context, logs, observation, or audit", async () => {
    const agentLog: string[] = [];
    const { broker } = brokerWith();

    const handle = broker.request({ ...SCOPE, credentialId: CRED_ID });
    agentLog.push(`agent received handle: ${handle}`);

    async function providerFetch(authHeader: string) {
      if (authHeader !== `Bearer ${CANARY}`) {
        throw new Error("401 unauthorized");
      }
      return { issues: [{ id: 1, title: "leaky faucet" }, { id: 2, title: "dead outlet" }] };
    }

    const observation = await broker.execute(handle, SCOPE, async (secret) => {
      const res = await providerFetch(`Bearer ${secret}`);
      return {
        type: "github.issues",
        source: SCOPE.target,
        fetchedAt: new Date().toISOString(),
        records: res.issues,
      };
    });
    agentLog.push(`agent built observation: ${JSON.stringify(observation)}`);

    const audit = broker.auditTrail();
    agentLog.push(`agent read audit: ${JSON.stringify(audit)}`);

    expectNoCanary(agentLog, observation, audit, handle);
    expect(observation.records.length).toBe(2);
    expect(audit.some((r) => r.event === "executed" && r.outcome === "OK")).toBe(true);
    const execRec = audit.find((r) => r.event === "executed")!;
    expect(execRec.principal).toBe(PRINCIPAL);
    expect(execRec.operation).toBe("fetch:issues");
    expect(execRec.target).toBe("github.com/ping-org/demo");
  });

  it("audit trail is correlatable but not replayable", async () => {
    const { broker } = brokerWith();
    const h = broker.request({ ...SCOPE, credentialId: CRED_ID });
    await broker.execute(h, SCOPE, async () => "ok");
    const audit = broker.auditTrail();
    const issued = audit.find((r) => r.event === "issued")!;
    const executed = audit.find((r) => r.event === "executed")!;
    expect(issued.handleFp).toBe(executed.handleFp);
    expect(issued.handleFp.includes("pingsec_1_")).toBe(false);
    await expect(broker.execute(issued.handleFp, SCOPE, async () => "x")).rejects.toThrow(
      expect.objectContaining({ code: "AUTH_REQUIRED" }),
    );
  });
});
