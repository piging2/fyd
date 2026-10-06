# Secret Broker — consumer port (lanes BCQ / CONN)

The ONE custody pattern for PING. Agents and connector code NEVER receive
tokens; they receive opaque capability handles. Full contract:
`~/workspace/ping-build-program/lane-l/STATE.md`.

```ts
import { SecretBroker } from "@/lib/secrets/secret-broker";

const broker = new SecretBroker({
  authorize: ({ principal, operation, target, tenantId }) => policy.check(...), // YOUR policy
  audiences: ["connector-runtime-seam"],  // trusted seams only
  // store defaults to EnvCredentialStore (process.env); swap for KMS later
});

// 1. Agent/connector requests a handle (policy-checked, scope-bound)
const handle = broker.request({
  principal: "connector:github:svc-1",
  operation: "fetch:issues",
  target: "github.com/owner/repo",
  tenantId: "tenant-acme",          // REQUIRED, from trusted context
  audience: "connector-runtime-seam",
  ttlSeconds: 300,                  // default; HARD CEILING 900
  maxUses: 1,                       // default; single-use
  credentialId: "GITHUB_CONN_TOKEN",// stored-credential id (env now, KMS later)
  purpose: "nightly issues sync",   // optional, recorded in audit
}); // -> "pingsec_1_..."

// 2. Execute inside the seam. The secret is resolved here and passed ONLY to fn.
//    fn's return value comes back; the secret NEVER does. Provider errors are
//    MASKED at the seam: the caller gets only the lane-K code + correlation id.
const observation = await broker.execute(handle, {
  principal: "connector:github:svc-1",
  operation: "fetch:issues",
  target: "github.com/owner/repo",
  tenantId: "tenant-acme",
  audience: "connector-runtime-seam",
}, async (secret) => {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${secret}` } });
  return toObservation(await res.json()); // must not include the secret
});

// 3. Renew a live lease (re-checks scope; 24h total cap, then re-issue):
broker.renew(handle, { principal, operation, target, tenantId, audience }, 300);

// 4. Narrow a handle (macaroon-style; never widens):
const child = broker.attenuate(handle, { ttlSeconds: 60, maxUses: 1 });

// 5. Audit (no secret values, ever): broker.auditTrail()
// 6. Revoke: broker.revoke(handle) / broker.revokeAll(principal)
// 7. Rotate: broker.rotate("GITHUB_CONN_TOKEN", newValue)
```

Rules: scope must match EXACTLY on execute/renew
(principal/operation/target/tenantId/audience); single-use default; TTL ceiling
900s; backend unreachable = fail closed (SOURCE_UNAVAILABLE, work does not
run); failures use the program taxonomy
(AUTH_REQUIRED/EXPIRED/PERMISSION_DENIED/SOURCE_UNAVAILABLE/...).
