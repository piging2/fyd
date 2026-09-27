/**
 * FYD presence compiler: PASTE URL -> working tenant, no human bridging stages.
 *
 * This is Lane P-01's product spine automation. It composes ONLY existing
 * machinery (no new authorities):
 *
 *   normalize            claimResourceIdForUrl (fyd/claim) — deterministic
 *                        tenant identity from the normalized origin.
 *   acquire              generateAnonymousPreview (fyd/onboarding) — SSRF-safe
 *                        fetch, structured extraction, OBSERVED claim.
 *   compile              compileGraph (this file, pure) — PageEvidence ->
 *                        evidence-backed PING object graph. Deterministic:
 *                        same evidence bytes -> same graph bytes.
 *   project              projection JSON in the exact contract the PING-side
 *                        dump produces (meta + graphDigest), so the existing
 *                        golden customer route (/build/[siteId]: verified
 *                        projection -> object-builder verify -> planSite ->
 *                        presentation intent -> validate -> BuildClient)
 *                        serves it unchanged. No new route code.
 *
 * Idempotency: the tenant id is deterministic from (normalized URL), so the
 * same submission twice resolves the same tenant. Every stage checkpoints
 * (what completed, what input digest it used, what artifact resulted); a
 * retry resumes from the failed stage and never reacquires blindly. A
 * per-tenant mkdir lock serializes concurrent builds.
 *
 * Progressive state (backed by checkpoints, never timers):
 *   ANALYZING -> UNDERSTANDING -> BUILDING -> READY, or FAILED.
 *
 * The object graph is the IR: it serves the website today and Ask FYD
 * context, Circle, search, and feed tomorrow. Every design decision here
 * answers: DOES THIS MAKE ANOTHER OUTPUT CHEAPER LATER?
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { claimResourceIdForUrl } from "../claim/resource-id";
import { ClaimError } from "../claim/types";
import {
  generateAnonymousPreview,
  type PreviewDeps,
} from "./anonymous-preview";
import type { PageEvidence } from "./extractor";
import type { ObjectGraph } from "../sitespec/types";
import type { ObjectProvenance } from "@/lib/ping/types";
import { canonicalize } from "@/lib/ping/ask-composer";

/** Producer version stamped into projection meta.dumperVersion. */
export const COMPILER_VERSION = "fyd-presence-compiler@1.0.0";

export type BuildState =
  | "UNKNOWN"
  | "ANALYZING"
  | "UNDERSTANDING"
  | "BUILDING"
  | "READY"
  | "FAILED";

export type StageName = "normalize" | "acquire" | "compile" | "project";
export const STAGES: StageName[] = ["normalize", "acquire", "compile", "project"];

export interface CompileTenantDeps {
  /** Directory holding <siteSlug>.json projections; _compiler/ state lives under it. */
  projectionDir: string;
  /** Injected preview deps (tests). Passed to setPreviewDepsForTests scope. */
  preview?: PreviewDeps | null;
  /** Injected clock (tests). */
  clock?: () => number;
  /** Lock staleness bound (tests). Default 10 minutes. */
  lockTimeoutMs?: number;
  /**
   * Test-only fault injection: throw at the named stage on the next run.
   * Used to prove resume without reacquiring.
   */
  faultAt?: StageName | null;
}

interface StageRecord {
  done: boolean;
  /** sha256 of the canonical input this stage ran on. */
  inputDigest: string;
  at: string;
  /** Stage artifact summary (JSON-serializable). */
  artifact?: Record<string, unknown>;
}

export interface TenantCheckpoint {
  version: 1;
  tenantId: string;
  siteSlug: string | null;
  normalizedUrl: string | null;
  resourceId: string | null;
  stages: Record<StageName, StageRecord>;
  failure: { stage: StageName; code: string; message: string; at: string } | null;
}

export interface BuildResult {
  ok: true;
  tenantId: string;
  siteSlug: string;
  /** Public route serving the generated presence. */
  siteUrl: string;
  state: BuildState;
  /** True when every stage was already complete: no work performed. */
  resumed: boolean;
}

export interface BuildFailure {
  ok: false;
  tenantId: string | null;
  state: BuildState;
  code: string;
  message: string;
  /** Stage that failed, for resume. */
  stage: StageName | null;
}

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function compilerDir(deps: CompileTenantDeps): string {
  return join(deps.projectionDir, "_compiler");
}

function checkpointPath(deps: CompileTenantDeps, tenantId: string): string {
  return join(compilerDir(deps), tenantId + ".json");
}

function lockPath(deps: CompileTenantDeps, tenantId: string): string {
  return join(compilerDir(deps), tenantId + ".lock");
}

function nowIso(deps: CompileTenantDeps): string {
  return new Date((deps.clock ?? Date.now)()).toISOString();
}

function emptyStages(): Record<StageName, StageRecord> {
  const r = {} as Record<StageName, StageRecord>;
  for (const s of STAGES) r[s] = { done: false, inputDigest: "", at: "" };
  return r;
}

function readCheckpoint(
  deps: CompileTenantDeps,
  tenantId: string,
): TenantCheckpoint | null {
  try {
    const raw = readFileSync(checkpointPath(deps, tenantId), "utf8");
    const c = JSON.parse(raw) as TenantCheckpoint;
    if (c.version !== 1 || c.tenantId !== tenantId) return null;
    return c;
  } catch {
    return null;
  }
}

function writeCheckpoint(deps: CompileTenantDeps, c: TenantCheckpoint): void {
  mkdirSync(compilerDir(deps), { recursive: true });
  const tmp = checkpointPath(deps, c.tenantId) + ".tmp";
  writeFileSync(tmp, JSON.stringify(c, null, 2), "utf8");
  renameSync(tmp, checkpointPath(deps, c.tenantId));
}

/**
 * Per-tenant mkdir lock (atomic on POSIX). Returns true when this caller
 * holds the lock. A lock older than lockTimeoutMs is considered stale and
 * taken over; checkpoint resume makes takeover safe.
 */
function acquireLock(deps: CompileTenantDeps, tenantId: string): boolean {
  const p = lockPath(deps, tenantId);
  const timeout = deps.lockTimeoutMs ?? 10 * 60 * 1000;
  const now = (deps.clock ?? Date.now)();
  try {
    mkdirSync(p);
    writeFileSync(
      join(p, "owner.json"),
      JSON.stringify({ pid: process.pid, startedAt: new Date(now).toISOString() }),
      "utf8",
    );
    return true;
  } catch {
    // Lock exists: check staleness.
    try {
      const o = JSON.parse(readFileSync(join(p, "owner.json"), "utf8")) as {
        startedAt: string;
      };
      if (now - new Date(o.startedAt).getTime() > timeout) {
        rmSync(p, { recursive: true, force: true });
        return acquireLock(deps, tenantId);
      }
    } catch {
      // Unreadable lock: treat as held.
    }
    return false;
  }
}

function releaseLock(deps: CompileTenantDeps, tenantId: string): void {
  rmSync(lockPath(deps, tenantId), { recursive: true, force: true });
}

/** Canonical URL normalization: deterministic, no credentials, no fragment. */
export function normalizeUrl(rawUrl: string): string {
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    throw new ClaimError("That URL could not be understood.", "invalid-url");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new ClaimError("Only http(s) URLs can become FYD tenants.", "invalid-url");
  }
  if (u.username || u.password) {
    throw new ClaimError("URLs with credentials are not accepted.", "invalid-url");
  }
  u.hostname = u.hostname.toLowerCase();
  if (
    (u.protocol === "http:" && u.port === "80") ||
    (u.protocol === "https:" && u.port === "443")
  ) {
    u.port = "";
  }
  u.hash = "";
  let s = u.toString();
  if (s.endsWith("/") && u.pathname === "/" && !u.search) {
    s = s.slice(0, -1);
  }
  return s;
}

function slugify(s: string): string {
  const slug = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "site";
}

/**
 * Deterministic site slug: human-readable base from the business title plus
 * a tenant-derived suffix so distinct tenants never collide.
 */
export function siteSlugFor(title: string | null, tenantId: string): string {
  return `${slugify(title ?? "")}-${tenantId.slice(4, 10)}`;
}

const NAV_STOPLIST = new Set([
  "home",
  "about",
  "about us",
  "contact",
  "contact us",
  "menu",
  "search",
  "login",
  "log in",
  "sign in",
  "privacy",
  "privacy policy",
  "terms",
  "terms of service",
  "sitemap",
]);

function cleanServices(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of raw) {
    const t = s.replace(/\s+/g, " ").trim();
    if (t.length < 3 || t.length > 80) continue;
    if (NAV_STOPLIST.has(t.toLowerCase())) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 12) break;
  }
  return out;
}

export interface CompileCtx {
  tenantId: string;
  /** Final URL after redirects: the provenance ref for every object. */
  sourceUrl: string;
  observedAt: string;
}

function bizIdFor(tenantId: string): string {
  return "website-business-" + sha256Hex(tenantId + "|business").slice(0, 16);
}

/**
 * Pure, deterministic: same PageEvidence + ctx -> byte-identical graph.
 * No wall-clock reads, no randomness, no I/O.
 *
 * Conventions follow the machine-generated fixtures (happy-place-graph.ts):
 * schemas ping.social.business@1 / location@1 / service@1, provenance kind
 * "website-derived" with ref "website-ingestion:<url>", claimKind
 * "website_statement" (claimed by the website, never verified fact).
 */
export function compileGraph(evidence: PageEvidence, ctx: CompileCtx): ObjectGraph {
  const at = ctx.observedAt;
  const bizId = bizIdFor(ctx.tenantId);
  // Controlling identity for website-derived objects: the stable web
  // identity of the tenant (the normalized origin's claim id).
  const controllerId = "web:" + ctx.tenantId;
  const provenance: ObjectProvenance = {
    kind: "website-derived",
    ref: "website-ingestion:" + ctx.sourceUrl,
    derivedAt: at,
  };
  const host = (() => {
    try {
      return new URL(ctx.sourceUrl).hostname;
    } catch {
      return ctx.sourceUrl;
    }
  })();
  const title = evidence.title?.trim() || host;

  const bizFields: Record<string, string> = {
    claimKind: "website_statement",
    website: ctx.sourceUrl,
    title,
  };
  if (evidence.description) bizFields["description"] = evidence.description;
  if (evidence.phone) bizFields["phone"] = evidence.phone;
  if (evidence.email) bizFields["email"] = evidence.email;
  if (evidence.address) {
    bizFields["address"] = evidence.address;
    bizFields["locality"] = evidence.address;
  }
  if (evidence.hours.length > 0) bizFields["hours"] = evidence.hours.join("; ");

  const objects: ObjectGraph["objects"] = [
    {
      id: bizId,
      schema: "ping.social.business@1",
      controllerId,
      visibility: "public",
      title,
      description: evidence.description ?? title,
      fields: bizFields,
      createdAt: at,
      updatedAt: at,
      provenance,
    },
  ];
  const relationships: ObjectGraph["relationships"] = [];

  if (evidence.address) {
    const locId = bizId + "-location";
    objects.push({
      id: locId,
      schema: "ping.social.location@1",
      controllerId,
      visibility: "public",
      title: evidence.address,
      description: "Coarse public location claim from the website's structured data.",
      fields: { locality: evidence.address, claimKind: "website_statement" },
      createdAt: at,
      updatedAt: at,
      provenance,
    });
    relationships.push({
      id: "rel-" + sha256Hex(ctx.tenantId + "|located_at").slice(0, 16),
      subject: bizId,
      predicate: "located_at",
      object: locId,
      status: "active",
      createdAt: at,
      evidenceRef: "website-ingestion:" + ctx.sourceUrl,
    });
  }

  for (const name of cleanServices(evidence.services)) {
    const svcId =
      bizId + "-service-" + sha256Hex(ctx.tenantId + "|service|" + name.toLowerCase()).slice(0, 12);
    objects.push({
      id: svcId,
      schema: "ping.social.service@1",
      controllerId,
      visibility: "public",
      title: name,
      description: name,
      fields: { name, claimKind: "website_statement" },
      createdAt: at,
      updatedAt: at,
      provenance,
    });
    relationships.push({
      id:
        "rel-" +
        sha256Hex(ctx.tenantId + "|offers|" + name.toLowerCase()).slice(0, 16),
      subject: bizId,
      predicate: "offers",
      object: svcId,
      status: "active",
      createdAt: at,
      evidenceRef: "website-ingestion:" + ctx.sourceUrl,
    });
  }

  return { objects, relationships };
}

interface BuildPlan {
  tenantId: string;
  resourceId: string;
  normalizedUrl: string;
}

/** Stage: normalize. Pure + deterministic; always safe to re-run. */
function stageNormalize(rawUrl: string, deps: CompileTenantDeps): BuildPlan {
  const normalizedUrl = normalizeUrl(rawUrl);
  const tenantId = claimResourceIdForUrl(normalizedUrl);
  return { tenantId, resourceId: tenantId, normalizedUrl };
}

function failCheckpoint(
  deps: CompileTenantDeps,
  c: TenantCheckpoint,
  stage: StageName,
  code: string,
  message: string,
): BuildFailure {
  c.failure = { stage, code, message, at: nowIso(deps) };
  writeCheckpoint(deps, c);
  return {
    ok: false,
    tenantId: c.tenantId,
    state: "FAILED",
    code,
    message,
    stage,
  };
}

/**
 * Build (or resume) the tenant for a pasted URL. Holds the per-tenant lock
 * for the whole run; concurrent callers get the current checkpoint state.
 */
export async function buildTenant(
  rawUrl: string,
  deps: CompileTenantDeps,
): Promise<BuildResult | BuildFailure> {
  mkdirSync(compilerDir(deps), { recursive: true });

  // Normalize BEFORE locking: the tenant id is the lock key.
  let plan: BuildPlan;
  try {
    plan = stageNormalize(rawUrl, deps);
  } catch (e) {
    const message = e instanceof ClaimError ? e.message : "That URL could not be understood.";
    return { ok: false, tenantId: null, state: "FAILED", code: "invalid-url", message, stage: "normalize" };
  }
  const { tenantId, normalizedUrl } = plan;

  if (!acquireLock(deps, tenantId)) {
    // Another build holds the lock: report current state, never duplicate work.
    const c = readCheckpoint(deps, tenantId);
    return {
      ok: true,
      tenantId,
      siteSlug: c?.siteSlug ?? siteSlugFor(null, tenantId),
      siteUrl: c?.siteSlug ? `/build/${c.siteSlug}` : `/build/${siteSlugFor(null, tenantId)}`,
      state: stateFor(c),
      resumed: true,
    };
  }

  try {
    return await runStages(plan, deps);
  } finally {
    releaseLock(deps, tenantId);
  }
}

async function runStages(
  plan: BuildPlan,
  deps: CompileTenantDeps,
): Promise<BuildResult | BuildFailure> {
  const { tenantId, normalizedUrl } = plan;
  let c = readCheckpoint(deps, tenantId);
  if (!c) {
    c = {
      version: 1,
      tenantId,
      siteSlug: null,
      normalizedUrl,
      resourceId: tenantId,
      stages: emptyStages(),
      failure: null,
    };
  }
  // A new build attempt clears the recorded failure; stages resume by digest.
  c.failure = null;
  c.normalizedUrl = normalizedUrl;
  let didWork = false;
  let currentStage: StageName = "normalize";

  const markDone = (
    stage: StageName,
    inputDigest: string,
    artifact?: Record<string, unknown>,
  ) => {
    c!.stages[stage] = { done: true, inputDigest, at: nowIso(deps), artifact };
    writeCheckpoint(deps, c!);
  };
  const needStage = (stage: StageName, inputDigest: string): boolean => {
    const r = c!.stages[stage];
    if (!r.done || r.inputDigest !== inputDigest) {
      // Input changed (or never ran): invalidate this stage and downstream.
      let clear = false;
      for (const s of STAGES) {
        if (s === stage) clear = true;
        if (clear) c!.stages[s] = { done: false, inputDigest: "", at: "" };
      }
      writeCheckpoint(deps, c!);
      return true;
    }
    return false;
  };

  // Stage normalize is pure; record it.
  try {
  markDone("normalize", sha256Hex("normalize|" + normalizedUrl), {
    tenantId,
    normalizedUrl,
  });

  // ---- acquire ----
  const acquireInput = sha256Hex("acquire|" + normalizedUrl);
  currentStage = "acquire";
  let evidence: PageEvidence;
  let finalUrl: string;
  let fetchedAt: string;
  const acq = c.stages.acquire;
  if (acq.done && acq.inputDigest === acquireInput && acq.artifact) {
    evidence = acq.artifact["evidence"] as PageEvidence;
    finalUrl = String(acq.artifact["finalUrl"]);
    fetchedAt = String(acq.artifact["fetchedAt"]);
  } else {
    if (deps.faultAt === "acquire") {
      return failCheckpoint(deps, c, "acquire", "fault", "fault injected at acquire");
    }
    didWork = true;
    const outcome = await generateAnonymousPreview({
      url: normalizedUrl,
      clientId: "presence-compiler:" + tenantId,
    });
    if (!outcome.ok) {
      return failCheckpoint(deps, c, "acquire", outcome.code, outcome.message);
    }
    evidence = outcome.preview.evidence;
    finalUrl = outcome.preview.finalUrl;
    fetchedAt = outcome.preview.fetchedAt;
    markDone("acquire", acquireInput, {
      evidence,
      evidenceDigest: sha256Hex(canonicalize(evidence)),
      finalUrl,
      fetchedAt,
      cacheHit: outcome.preview.crawl.cacheHit ? 1 : 0,
    });
  }

  // ---- compile ----
  const evidenceDigest = sha256Hex(canonicalize(evidence));
  const compileInput = sha256Hex("compile|" + evidenceDigest);
  currentStage = "compile";
  let graph: ObjectGraph;
  let graphDigest: string;
  if (!needStage("compile", compileInput)) {
    const art = c.stages.compile.artifact!;
    graphDigest = String(art["graphDigest"]);
    // Re-derive deterministically rather than storing the whole graph.
    graph = compileGraph(evidence, { tenantId, sourceUrl: finalUrl, observedAt: fetchedAt });
  } else {
    if (deps.faultAt === "compile") {
      return failCheckpoint(deps, c, "compile", "fault", "fault injected at compile");
    }
    didWork = true;
    graph = compileGraph(evidence, { tenantId, sourceUrl: finalUrl, observedAt: fetchedAt });
    graphDigest = sha256Hex(canonicalize(graph));
    const siteSlug = siteSlugFor(evidence.title, tenantId);
    c.siteSlug = siteSlug;
    markDone("compile", compileInput, {
      graphDigest,
      siteSlug,
      objects: graph.objects.length,
      relationships: graph.relationships.length,
    });
  }
  const siteSlug = c.siteSlug ?? siteSlugFor(evidence.title, tenantId);
  c.siteSlug = siteSlug;

  // ---- project ----
  const projectInput = sha256Hex("project|" + graphDigest);
  currentStage = "project";
  if (needStage("project", projectInput)) {
    if (deps.faultAt === "project") {
      return failCheckpoint(deps, c, "project", "fault", "fault injected at project");
    }
    didWork = true;
    const at = nowIso(deps);
    const projection = {
      meta: {
        siteId: siteSlug,
        dumpedAt: at,
        dumperVersion: COMPILER_VERSION,
        baseDigest: graphDigest,
        fixtureFileDigest: sha256Hex(
          canonicalize({ normalizedUrl, evidenceDigest }),
        ),
        fixtureHeader:
          "presence-compiler: graph derived from source observation; no TS fixture",
        overlayEventIds: [],
        graphDigest,
        generatedAt: at,
      },
      graph,
    };
    const dest = join(deps.projectionDir, siteSlug + ".json");
    const tmp = dest + ".tmp";
    mkdirSync(deps.projectionDir, { recursive: true });
    writeFileSync(tmp, JSON.stringify(projection, null, 2), "utf8");
    renameSync(tmp, dest);
    markDone("project", projectInput, { projectionPath: dest, siteSlug });
  }

  writeCheckpoint(deps, c);
  return {
    ok: true,
    tenantId,
    siteSlug,
    siteUrl: `/build/${siteSlug}`,
    state: "READY",
    resumed: !didWork,
  };
  } catch (e) {
    // Fail closed: an unexpected throw becomes a recorded FAILED stage,
    // never a silent stall. The next attempt resumes from the checkpoint.
    const message = e instanceof Error ? e.message : String(e);
    return failCheckpoint(deps, c, currentStage, "internal", message);
  }
}

/** Current build state for a tenant, from its checkpoint. Polling seam. */
export function tenantState(
  tenantId: string,
  deps: CompileTenantDeps,
): { tenantId: string; siteSlug: string | null; siteUrl: string | null; state: BuildState; failure: TenantCheckpoint["failure"] } {
  const c = readCheckpoint(deps, tenantId);
  const siteSlug = c?.siteSlug ?? null;
  return {
    tenantId,
    siteSlug,
    siteUrl: siteSlug ? `/build/${siteSlug}` : null,
    state: stateFor(c),
    failure: c?.failure ?? null,
  };
}

function stateFor(c: TenantCheckpoint | null): BuildState {
  if (!c) return "UNKNOWN";
  if (c.failure) return "FAILED";
  if (c.stages.project.done) return "READY";
  if (c.stages.compile.done) return "BUILDING";
  if (c.stages.acquire.done) return "UNDERSTANDING";
  if (c.stages.normalize.done) return "ANALYZING";
  return "UNKNOWN";
}

/** Resolve a raw URL to its tenant id without building (for the GET seam). */
export function tenantIdForUrl(rawUrl: string): string | null {
  try {
    return claimResourceIdForUrl(normalizeUrl(rawUrl));
  } catch {
    return null;
  }
}

export function isValidTenantId(v: string): boolean {
  return /^url-[0-9a-f]{16}$/.test(v);
}

export function isValidSiteSlug(v: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$/.test(v) && v.includes("-");
}
