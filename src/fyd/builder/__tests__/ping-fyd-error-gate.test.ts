/**
 * Dogfood error gate: bad observations never become projected sites.
 *
 * Uses the REAL ping-fyd projection (owner-asserted, digest-verified) and
 * injects one controlled bad observation at a time, then runs the route's
 * pipeline order (verifyObjectGraph BEFORE planSite). The gate must throw
 * before the planner ever sees the graph: a bad observation stays a
 * rejected observation, never a projected claim.
 *
 * Cases:
 * 1. bad observation: a service object with an emptied provenance ref
 *    (violates the "no customer fact without a traceable basis" law);
 * 2. ambiguous/conflicting observation: a second object reusing the
 *    business id with a conflicting title (two sources disagreeing about
 *    the same identity);
 * 3. control: the untouched projection verifies and composes.
 */
import { getPingObjectGraphSync } from "@/fyd/data/ping-object-source";
import {
  ObjectBuilderError,
  verifyObjectGraph,
} from "@/fyd/builder/object-builder";
import { planSite } from "@/fyd/builder/planner";
import { strategyForSite } from "@/fyd/builder/strategy-for-site";
import type { ObjectGraph } from "@/fyd/sitespec/types";
import type { PingProjection } from "@/fyd/data/ping-object-source";

const SITE_ID = "ping-fyd";
const CTX = { tenantId: SITE_ID };

function cloneGraph(graph: ObjectGraph): ObjectGraph {
  return JSON.parse(JSON.stringify(graph)) as ObjectGraph;
}

function proj(graph: ObjectGraph): PingProjection {
  const base = getPingObjectGraphSync(SITE_ID);
  return { graph, meta: base.meta } as PingProjection;
}

/**
 * The route's pipeline order: verification precedes planning. Returns the
 * spec when the graph is clean; throws ObjectBuilderError when it is not.
 * A throw here means NOTHING was projected: planSite is unreachable.
 */
function tryComposeSite(graph: ObjectGraph) {
  const projection = proj(graph);
  const verified = verifyObjectGraph(CTX, projection);
  const strategy = strategyForSite(SITE_ID, verified.graph);
  const planned = planSite({
    ctx: CTX,
    graph: verified.graph,
    vector: strategy.vector,
    generatedAt: projection.meta.generatedAt,
    attestation: verified.attestation,
  });
  return planned.spec;
}

test("control: the untouched ping-fyd projection composes", () => {
  const { graph } = getPingObjectGraphSync(SITE_ID);
  const spec = tryComposeSite(cloneGraph(graph));
  expect(spec.ownerObjectId).toBe("ping-fyd-business");
});

test("bad observation (empty provenance ref) is rejected: nothing projected", () => {
  const { graph } = getPingObjectGraphSync(SITE_ID);
  const tainted = cloneGraph(graph);
  const svc = tainted.objects.find((o) => o.id === "ping-fyd-svc-calls");
  expect(svc).toBeDefined();
  // The observation arrives with no traceable basis.
  svc!.provenance = { kind: "website-derived", ref: "", derivedAt: svc!.provenance.derivedAt };
  let spec: unknown = "unreached-sentinel";
  let error: unknown = null;
  try {
    spec = tryComposeSite(tainted);
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(ObjectBuilderError);
  // The planner never ran: no spec was produced from the tainted graph.
  expect(spec).toBe("unreached-sentinel");
});

test("conflicting observation (duplicate id, disagreeing title) is rejected: nothing projected", () => {
  const { graph } = getPingObjectGraphSync(SITE_ID);
  const tainted = cloneGraph(graph);
  const business = tainted.objects.find((o) => o.id === "ping-fyd-business");
  expect(business).toBeDefined();
  // A second source asserts a conflicting identity for the same id.
  tainted.objects.push({
    ...JSON.parse(JSON.stringify(business)),
    title: "PING Social (totally different business)",
  });
  let spec: unknown = "unreached-sentinel";
  let error: unknown = null;
  try {
    spec = tryComposeSite(tainted);
  } catch (e) {
    error = e;
  }
  expect(error).toBeInstanceOf(ObjectBuilderError);
  expect(spec).toBe("unreached-sentinel");
});
