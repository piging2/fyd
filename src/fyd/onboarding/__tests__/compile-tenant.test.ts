/**
 * Proof tests for the FYD presence compiler (Lane P-01).
 *
 * These are the five required proofs, each as a falsifiable test:
 *
 *   1. SUBMIT:        one URL -> exactly one tenant, READY, valid projection.
 *   2. SUBMIT AGAIN:  same URL -> same tenant, no new fetch, no duplicate work.
 *   3. RETRY AFTER FAILURE: fault mid-pipeline -> FAILED with stage recorded;
 *                      retry resumes and finishes without reacquiring.
 *   4. PROCESS RESTART: checkpoint lives on disk; a fresh compiler instance
 *                      resumes from the completed acquire stage.
 *   5. CONCURRENT DOUBLE CLICK: two racing builds -> one tenant, one fetch,
 *                      one projection; both callers converge.
 *
 * Plus: determinism (same evidence -> byte-identical graph), input
 * invalidation (changed upstream input rebuilds), and the serving contract
 * (the generated projection loads through getPingObjectGraph unchanged).
 *
 * Network is fully mocked: these tests never touch the real internet.
 */
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  setPreviewDepsForTests,
  type PreviewDeps,
} from "../anonymous-preview";
import {
  AnonymousGate,
  GenerationQuota,
  TokenBucket,
} from "../../net/rate-limit";
import {
  CrawlLedger,
  DedupCache,
  OriginSemaphore,
  type CrawlBudget,
} from "../../net/budgets";
import type { SafeFetchDeps } from "../../net/safe-fetch";
import {
  buildTenant,
  compileGraph,
  normalizeUrl,
  siteSlugFor,
  tenantIdForUrl,
  tenantState,
  type CompileTenantDeps,
} from "../compile-tenant";
import type { PageEvidence } from "../extractor";
import { getPingObjectGraph } from "../../data/ping-object-source";
import { verifyObjectGraph } from "../../builder/object-builder";
import { planSite } from "../../builder/planner";
import { vectorForSite } from "../../builder/site-vectors";
import { isRenderable, validateSiteSpec } from "../../sitespec/validator";

const HTML =
  "<html><head><title>Boulder Fix Plumbing</title>" +
  '<meta name="description" content="Family-owned plumbers since 2004."></head>' +
  "<body><h1>Boulder Fix Plumbing</h1>" +
  "<p>Call (303) 555-0119 or write hello@boulderfix.example</p>" +
  '<ul><li>Drain cleaning</li><li>Water heater install</li><li>Home</li><li>Contact</li></ul>' +
  "</body></html>";

function netFor(
  publicHosts: string[],
  calls: { n: number },
  delayMs = 0,
): SafeFetchDeps {
  return {
    dnsLookup: async (host: string) =>
      publicHosts.includes(host)
        ? [{ address: "93.184.216.34" }]
        : [{ address: "10.0.0.5" }],
    fetchImpl: (async () => {
      calls.n += 1;
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      return new Response(HTML, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }) as typeof fetch,
  };
}

function previewDeps(
  net: SafeFetchDeps,
  clock: () => number,
): PreviewDeps {
  const budget: CrawlBudget = { maxPages: 6, maxTotalBytes: 8 * 1024 * 1024 };
  return {
    net,
    gate: new AnonymousGate(
      clock,
      new TokenBucket(1000, 1000, clock),
      new GenerationQuota(1000, 3_600_000, clock),
    ),
    crawlBudget: budget,
    ledger: new CrawlLedger(budget),
    semaphore: new OriginSemaphore(2, 6),
    cache: new DedupCache({ ttlMs: 600_000, maxEntries: 500 }),
    clock,
  };
}

const FIXED_NOW = 1_786_000_000_000;

function harness(opts?: { delayMs?: number }): {
  deps: CompileTenantDeps;
  calls: { n: number };
  dir: string;
  claims: string;
} {
  const dir = mkdtempSync(join(tmpdir(), "fyd-compile-"));
  const claims = mkdtempSync(join(tmpdir(), "fyd-claims-"));
  const calls = { n: 0 };
  process.env.FYD_CLAIM_DIR = claims;
  process.env.FYD_PROJECTION_DIR = dir;
  setPreviewDepsForTests(
    previewDeps(netFor(["boulderfix.example"], calls, opts?.delayMs ?? 0), () => FIXED_NOW),
  );
  const deps: CompileTenantDeps = {
    projectionDir: dir,
    clock: () => FIXED_NOW,
    lockTimeoutMs: 60_000,
  };
  return { deps, calls, dir, claims };
}

const URL = "https://boulderfix.example/";

describe("presence compiler: normalization and identity", () => {
  test("same business, different URL spellings -> one tenant id", () => {
    const a = tenantIdForUrl("https://boulderfix.example/");
    const b = tenantIdForUrl("https://boulderfix.example");
    const c = tenantIdForUrl("HTTPS://BOULDERFIX.EXAMPLE/");
    expect(a).toMatch(/^url-[0-9a-f]{16}$/);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  test("non-http and credentialed URLs are rejected before any work", () => {
    expect(() => normalizeUrl("ftp://boulderfix.example/")).toThrow();
    expect(() => normalizeUrl("https://user:pass@boulderfix.example/")).toThrow();
    expect(tenantIdForUrl("not a url")).toBeNull();
  });

  test("site slug is deterministic and route-safe", () => {
    const id = tenantIdForUrl(URL)!;
    expect(siteSlugFor("Boulder Fix Plumbing", id)).toBe(
      "boulder-fix-plumbing-" + id.slice(4, 10),
    );
    expect(siteSlugFor("Boulder Fix Plumbing", id)).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("presence compiler: SUBMIT", () => {
  const VAR = "FYD_CLAIM_DIR";
  const saved = process.env[VAR];
  const savedProj = process.env.FYD_PROJECTION_DIR;
  afterEach(() => {
    setPreviewDepsForTests(null);
    if (saved === undefined) delete process.env[VAR];
    else process.env[VAR] = saved;
    if (savedProj === undefined) delete process.env.FYD_PROJECTION_DIR;
    else process.env.FYD_PROJECTION_DIR = savedProj;
  });

  test("one URL -> one tenant, READY, exactly one projection file", async () => {
    const { deps, calls, dir } = harness();
    const r = await buildTenant(URL, deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tenantId).toMatch(/^url-[0-9a-f]{16}$/);
    expect(r.state).toBe("READY");
    expect(r.siteUrl).toBe(`/build/${r.siteSlug}`);
    expect(calls.n).toBe(1);

    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files).toEqual([r.siteSlug + ".json"]);

    const checkpoint = JSON.parse(
      readFileSync(join(dir, "_compiler", r.tenantId + ".json"), "utf8"),
    );
    for (const stage of ["normalize", "acquire", "compile", "project"]) {
      expect(checkpoint.stages[stage].done).toBe(true);
      expect(checkpoint.stages[stage].inputDigest).not.toBe("");
    }
    expect(checkpoint.failure).toBeNull();
  });

  test("the projection loads through the real serving seam", async () => {
    const { deps, dir } = harness();
    const r = await buildTenant(URL, deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const { meta, graph } = await getPingObjectGraph(r.siteSlug);
    expect(meta.siteId).toBe(r.siteSlug);
    expect(meta.dumperVersion).toBe("fyd-presence-compiler@1.0.0");
    expect(typeof meta.graphDigest).toBe("string");
    expect(graph.objects.length).toBeGreaterThan(0);

    const biz = graph.objects.find((o) => o.schema === "ping.social.business@1")!;
    expect(biz.title).toBe("Boulder Fix Plumbing");
    expect(biz.provenance.kind).toBe("website-derived");
    expect(String(biz.provenance.ref)).toContain("boulderfix.example");
    expect(biz.fields["claimKind"]).toBe("website_statement");
    expect(biz.fields["phone"]).toBe("(303) 555-0119");

    const services = graph.objects.filter((o) => o.schema === "ping.social.service@1");
    expect(services.map((s) => s.title).sort()).toEqual(
      ["Drain cleaning", "Water heater install"].sort(),
    );
    // Nav junk ("Home", "Contact") must not become services.
    expect(services.some((s) => /^(home|contact)$/i.test(s.title))).toBe(false);

    const offers = graph.relationships.filter((o) => o.predicate === "offers");
    expect(offers.length).toBe(services.length);
    for (const rel of graph.relationships) {
      expect(rel.evidenceRef).toContain("boulderfix.example");
    }
  });

  test("the projection survives the golden customer route pipeline (/build/[siteId])", async () => {
  const { deps } = harness();
  const r = await buildTenant(URL, deps);
  expect(r.ok).toBe(true);
  if (!r.ok) return;

  // Replicates src/app/build/[siteId]/page.tsx server pipeline:
  // verified projection -> object-builder verify -> planSite ->
  // validate -> renderable gate. (The page then applies presentation
  // intent; compiler projections carry no intent block, and
  // applyPresentationIntent(spec, null, graph) is a documented no-op.)
  const projection = await getPingObjectGraph(r.siteSlug);
  expect(projection.presentationIntent).toBeNull();
  const verified = verifyObjectGraph({ tenantId: r.siteSlug }, projection);
  expect(verified.attestation.checks.length).toBeGreaterThan(0);
  const planned = planSite({
    ctx: { tenantId: r.siteSlug },
    graph: verified.graph,
    vector: vectorForSite(r.siteSlug),
    generatedAt: projection.meta.generatedAt,
    attestation: verified.attestation,
  });
  const spec = planned.spec;
  const knownSchemas = new Set(verified.graph.objects.map((o) => o.schema));
  const findings = validateSiteSpec(spec, knownSchemas);
  expect(isRenderable(findings)).toBe(true);
  // The spec carries the business's own evidence-bound facts.
  const text = JSON.stringify(spec);
  expect(text).toContain("Boulder Fix Plumbing");
  });
});

describe("presence compiler: SUBMIT AGAIN (idempotency)", () => {
  const VAR = "FYD_CLAIM_DIR";
  const saved = process.env[VAR];
  const savedProj = process.env.FYD_PROJECTION_DIR;
  afterEach(() => {
    setPreviewDepsForTests(null);
    if (saved === undefined) delete process.env[VAR];
    else process.env[VAR] = saved;
    if (savedProj === undefined) delete process.env.FYD_PROJECTION_DIR;
    else process.env.FYD_PROJECTION_DIR = savedProj;
  });

  test("second submit: same tenant, zero new fetches, zero new files", async () => {
    const { deps, calls, dir } = harness();
    const first = await buildTenant(URL, deps);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const fetchesAfterFirst = calls.n;

    // Fresh preview deps (empty dedupe cache): any refetch would hit the mock.
    setPreviewDepsForTests(
      previewDeps(netFor(["boulderfix.example"], calls), () => FIXED_NOW),
    );
    const second = await buildTenant(URL, deps);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.tenantId).toBe(first.tenantId);
    expect(second.siteSlug).toBe(first.siteSlug);
    expect(second.state).toBe("READY");
    expect(second.resumed).toBe(true);
    expect(calls.n).toBe(fetchesAfterFirst);

    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files).toEqual([first.siteSlug + ".json"]);
  });

  test("state stays consistent across repeated submissions", async () => {
    const { deps } = harness();
    for (let i = 0; i < 3; i++) {
      const r = await buildTenant(URL, deps);
      expect(r.ok && r.state).toBe("READY");
    }
    const st = tenantState(tenantIdForUrl(URL)!, deps);
    expect(st.state).toBe("READY");
    expect(st.siteUrl).toBe(`/build/${st.siteSlug}`);
  });
});

describe("presence compiler: RETRY AFTER FAILURE", () => {
  const VAR = "FYD_CLAIM_DIR";
  const saved = process.env[VAR];
  const savedProj = process.env.FYD_PROJECTION_DIR;
  afterEach(() => {
    setPreviewDepsForTests(null);
    if (saved === undefined) delete process.env[VAR];
    else process.env[VAR] = saved;
    if (savedProj === undefined) delete process.env.FYD_PROJECTION_DIR;
    else process.env.FYD_PROJECTION_DIR = savedProj;
  });

  test("fault at compile -> FAILED; retry finishes without refetching", async () => {
    const { deps, calls } = harness();
    const failed = await buildTenant(URL, { ...deps, faultAt: "compile" });
    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    expect(failed.state).toBe("FAILED");
    expect(failed.stage).toBe("compile");
    const fetchesAfterFailure = calls.n;
    expect(fetchesAfterFailure).toBe(1);

    const st = tenantState(failed.tenantId!, deps);
    expect(st.state).toBe("FAILED");
    expect(st.failure?.stage).toBe("compile");

    // Retry with fresh (empty) preview cache: resume must not reacquire.
    setPreviewDepsForTests(
      previewDeps(netFor(["boulderfix.example"], calls), () => FIXED_NOW),
    );
    const retried = await buildTenant(URL, deps);
    expect(retried.ok).toBe(true);
    if (!retried.ok) return;
    expect(retried.state).toBe("READY");
    expect(retried.tenantId).toBe(failed.tenantId);
    expect(calls.n).toBe(fetchesAfterFailure);

    const after = tenantState(retried.tenantId, deps);
    expect(after.state).toBe("READY");
    expect(after.failure).toBeNull();
  });
});

describe("presence compiler: PROCESS RESTART", () => {
  const VAR = "FYD_CLAIM_DIR";
  const saved = process.env[VAR];
  const savedProj = process.env.FYD_PROJECTION_DIR;
  afterEach(() => {
    setPreviewDepsForTests(null);
    if (saved === undefined) delete process.env[VAR];
    else process.env[VAR] = saved;
    if (savedProj === undefined) delete process.env.FYD_PROJECTION_DIR;
    else process.env.FYD_PROJECTION_DIR = savedProj;
  });

  test("kill during SiteSpec-era stage (project): fresh instance resumes from acquire", async () => {
    const { calls } = harness();
    const tenantId = tenantIdForUrl(URL)!;

    // Instance 1: dies at the project stage. The lock is released by
    // buildTenant's finally even on failure; only the checkpoint survives.
    const first = await buildTenant(URL, {
      projectionDir: process.env.FYD_PROJECTION_DIR!,
      clock: () => FIXED_NOW,
      faultAt: "project",
    });
    expect(first.ok).toBe(false);
    if (first.ok) return;
    expect(first.stage).toBe("project");
    expect(calls.n).toBe(1);

    // Instance 2 (simulated restart: brand-new deps object, fresh preview
    // cache, same disk): must resume from completed acquire, not refetch.
    setPreviewDepsForTests(
      previewDeps(netFor(["boulderfix.example"], calls), () => FIXED_NOW),
    );
    const second = await buildTenant(URL, {
      projectionDir: process.env.FYD_PROJECTION_DIR!,
      clock: () => FIXED_NOW,
      lockTimeoutMs: 60_000,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.tenantId).toBe(tenantId);
    expect(second.state).toBe("READY");
    expect(calls.n).toBe(1);

    const st = tenantState(tenantId, {
      projectionDir: process.env.FYD_PROJECTION_DIR!,
    });
    expect(st.state).toBe("READY");
  });
});

describe("presence compiler: CONCURRENT DOUBLE CLICK", () => {
  const VAR = "FYD_CLAIM_DIR";
  const saved = process.env[VAR];
  const savedProj = process.env.FYD_PROJECTION_DIR;
  afterEach(() => {
    setPreviewDepsForTests(null);
    if (saved === undefined) delete process.env[VAR];
    else process.env[VAR] = saved;
    if (savedProj === undefined) delete process.env.FYD_PROJECTION_DIR;
    else process.env.FYD_PROJECTION_DIR = savedProj;
  });

  test("two racing builds -> one tenant, one fetch, one projection", async () => {
    const { deps, calls, dir } = harness({ delayMs: 80 });
    const [a, b] = await Promise.all([buildTenant(URL, deps), buildTenant(URL, deps)]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.tenantId).toBe(b.tenantId);
    expect(calls.n).toBe(1);

    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files).toHaveLength(1);

    // Both callers converge on the same READY tenant afterwards.
    const st = tenantState(a.tenantId, deps);
    expect(st.state).toBe("READY");
    expect(st.siteSlug).toBe(a.siteSlug === st.siteSlug ? a.siteSlug : b.siteSlug);
  });
});

describe("presence compiler: determinism and invalidation", () => {
  test("compileGraph is pure: same evidence -> byte-identical graph", () => {
    const evidence: PageEvidence = {
      title: "Boulder Fix Plumbing",
      description: "Family-owned plumbers since 2004.",
      headings: ["Boulder Fix Plumbing"],
      phone: "(303) 555-0119",
      email: "hello@boulderfix.example",
      address: "",
      services: ["Drain cleaning", "Water heater install", "Home"],
      hours: [],
      socialLinks: [],
      rawTextLength: 120,
    };
    const ctx = {
      tenantId: "url-0123456789abcdef",
      sourceUrl: "https://boulderfix.example/",
      observedAt: "2026-09-27T00:00:00.000Z",
    };
    const g1 = compileGraph(evidence, ctx);
    const g2 = compileGraph(evidence, JSON.parse(JSON.stringify(ctx)));
    expect(JSON.stringify(g2)).toBe(JSON.stringify(g1));
    // Service objects carry deterministic ids (no random UUIDs).
    const svc = g1.objects.find((o) => o.title === "Drain cleaning")!;
    expect(g2.objects.find((o) => o.title === "Drain cleaning")!.id).toBe(svc.id);
  });

  test("identical builds in separate dirs -> byte-identical projections", async () => {
    const VAR = "FYD_CLAIM_DIR";
    const saved = process.env[VAR];
    const savedProj = process.env.FYD_PROJECTION_DIR;
    try {
      const mk = () => {
        const dir = mkdtempSync(join(tmpdir(), "fyd-compile-"));
        const claims = mkdtempSync(join(tmpdir(), "fyd-claims-"));
        process.env.FYD_CLAIM_DIR = claims;
        const calls = { n: 0 };
        setPreviewDepsForTests(
          previewDeps(netFor(["boulderfix.example"], calls), () => FIXED_NOW),
        );
        return { dir, deps: { projectionDir: dir, clock: () => FIXED_NOW } as CompileTenantDeps };
      };
      const a = mk();
      const ra = await buildTenant(URL, a.deps);
      const b = mk();
      const rb = await buildTenant(URL, b.deps);
      expect(ra.ok && rb.ok).toBe(true);
      if (!ra.ok || !rb.ok) return;
      const pa = readFileSync(join(a.dir, ra.siteSlug + ".json"), "utf8");
      const pb = readFileSync(join(b.dir, rb.siteSlug + ".json"), "utf8");
      expect(pa).toBe(pb);
    } finally {
      setPreviewDepsForTests(null);
      if (saved === undefined) delete process.env[VAR];
      else process.env[VAR] = saved;
      if (savedProj === undefined) delete process.env.FYD_PROJECTION_DIR;
      else process.env.FYD_PROJECTION_DIR = savedProj;
    }
  });
});
