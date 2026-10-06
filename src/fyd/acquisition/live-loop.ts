/**
 * FYD live acquisition loop: URL -> DISCOVER -> ACQUIRE -> UNDERSTAND ->
 * RESOLVE -> GENERATE (+ MEDIA for authorized demo tenants).
 *
 * TRACK F (2026-09-25). This is the first proven live path from a real
 * source URL to a generated FYD presence. It composes ONLY existing
 * machinery:
 *
 *   DISCOVER  L0 policy gate (shape + DNS public check) reusing
 *             isPublicIp from @/fyd/net/safe-fetch (Lane A).
 *   ACQUIRE   L1 static HTTP via the AcquisitionAdapter implementation in
 *             ./static-adapter (safeFetchPage through the SSRF gate).
 *   UNDERSTAND proceduralizer.parseRich (structured-data, OG/meta,
 *             title, service-card extraction).
 *   RESOLVE   proceduralizer normalize -> provenance -> scopeFields ->
 *             resolve -> project (deterministic, evidence-labeled).
 *   GENERATE  object-builder verifyObjectGraph -> planner planSite ->
 *             sitespec validateSiteSpec. The binding verifier runs inside
 *             planSite; no new authority class is created anywhere here.
 *   MEDIA     Track A media pipeline (ingestSiteMedia +
 *             attachMediaToGraph) behind ONE function, authorized demo
 *             tenants only.
 *
 * SEAM (PRESERVE, do not build): the L2 browser-rendered fallback is NOT
 * implemented. static-adapter records the L2 consideration as a typed
 * policy note. The harvest lane is evaluating Crawl4AI; a Crawl4AI
 * adapter would plug in as an alternate fetcher behind the
 * AcquisitionAdapter interface (same typed observations out), not as a
 * rewrite of this loop.
 *
 * FAIL CLOSED: hostile URLs (private IP, metadata endpoint, credentialed
 * URL, bad scheme, non-HTML, oversized, timeout) never throw uncaught and
 * never touch the internal network. They terminate with a typed
 * LiveAcquisitionError code. Every stage boundary is typed; there is no
 * silent empty result: ACQ_EMPTY_CONTENT refuses a presence built from
 * zero evidence.
 *
 * RIGHTS HONESTY: arbitrary third-party ingestion needs a rights/policy
 * boundary that does not exist yet (per the product authority decisions).
 * Media acquisition runs ONLY for the explicitly authorized demo tenants
 * below, and only when the fetched page's host matches that tenant's
 * allowlisted host. Everything else gets MEDIA_RIGHTS_SCOPE (skip with a
 * typed reason), never silent media.
 *
 * Server-only: uses node:dns, node:crypto, node:fs, sharp (via the media
 * pipeline). Never import from a client component.
 */

import { lookup } from "node:dns/promises";
import { sha256Hex } from "@/lib/ping/digest";
import { join } from "node:path";
import { isPublicIp, type SafeFetchDeps } from "@/fyd/net/safe-fetch";
import {
  canonicalEntityUrl,
  evidenceRefForFact,
  normalize,
  parseRich,
  project,
  provenance,
  relate,
  resolve,
  scopeFields,
  type AcquiredSource,
  type ExtractedField,
  type ParsedFact,
  type ProjectedGraph,
  type SourceRecord,
} from "@/fyd/proceduralize/proceduralizer";
import {
  selectPrimaryBusiness,
  type ScorableFact,
} from "@/fyd/proceduralize/structured-data";
import {
  verifyObjectGraph,
  type GraphAttestation,
} from "@/fyd/builder/object-builder";
import { planSite, type PlannedSite } from "@/fyd/builder/planner";
import { DEFAULT_VECTOR } from "@/fyd/builder/site-vectors";
import {
  isRenderable,
  validateSiteSpec,
} from "@/fyd/sitespec/validator";
import type { FYDFinding, FYDSiteSpec, ObjectGraph } from "@/fyd/sitespec/types";
import type { PingProjection } from "@/fyd/data/ping-object-source";
import type { PingObject, PingRelationship } from "@/lib/ping/types";
import { ingestSiteMedia } from "@/fyd/media/ingest";
import { attachMediaToGraph } from "@/fyd/media/attach";
import {
  galleryMediaFor,
  heroMediaFor,
  readPipelineManifest,
  type DisplayMedia,
} from "@/fyd/media/select";
import {
  StaticAcquisitionAdapter,
  type LiveAcquiredObservation,
} from "./static-adapter";
import type { AcquisitionRequest } from "./acquisition-adapter";
import {
  LiveAcquisitionError,
  type AcquisitionFailureCode,
  type LoopStageName,
} from "./errors";

export interface LoopStageReport {
  stage: LoopStageName;
  status: "ok" | "failed" | "skipped";
  detail: string;
  ms: number;
}

export interface SocialIntakeResult {
  url: string;
  status: "accepted" | "rejected";
  code?: AcquisitionFailureCode;
  detail: string;
}

export interface DocumentIntakeResult {
  name: string;
  status: "recorded";
  detail: string;
}

export interface MediaStageSummary {
  status: "ok" | "skipped";
  reason: string;
  ingested: number;
  rejected: number;
  failed: number;
  duplicates: number;
  mediaObjects: number;
}

export interface LiveLoopReport {
  tenantId: string;
  seedUrl: string;
  finalUrl: string | null;
  startedAt: string;
  finishedAt: string;
  /**
   * Hour-10 magic-moment instrumentation (2026-09-30). Named absolute
   * timestamps for the customer metric URL -> FIRST TRUSTWORTHY USEFUL
   * RENDER. urlSubmittedAt is the POST /api/fyd/build receipt time
   * (the route passes urlSubmittedAtIso); firstMeaningfulObjectAt is
   * stamped when the projected graph first holds >= 1 object;
   * siteSpecReadyAt when validateSiteSpec passes; firstRenderAt is
   * filled by the job page's render beacon on first human view
   * (null until then).
   */
  timings: {
    urlSubmittedAt: string | null;
    firstMeaningfulObjectAt: string | null;
    siteSpecReadyAt: string | null;
    firstRenderAt: string | null;
  };
  stages: LoopStageReport[];
  graphSummary: {
    objects: number;
    relationships: number;
    schemas: Record<string, number>;
  };
  specSummary: {
    pages: number;
    sections: number;
    ownerObjectId: string;
    semanticDigest: string;
    renderable: boolean;
    errors: number;
    warnings: number;
    info: number;
  } | null;
  media: MediaStageSummary | null;
  socials: SocialIntakeResult[];
  documents: DocumentIntakeResult[];
  error: { code: AcquisitionFailureCode; stage: LoopStageName; message: string } | null;
}

export interface LiveLoopResult {
  report: LiveLoopReport;
  graph: ObjectGraph;
  spec: FYDSiteSpec | null;
  findings: FYDFinding[];
  renderable: boolean;
  attestation: GraphAttestation | null;
  planned: PlannedSite | null;
  heroMedia: DisplayMedia | null;
  galleryMedia: DisplayMedia[];
}

export interface LiveLoopOptions {
  url: string;
  tenantId?: string;
  businessSlug?: string;
  controllerId?: string;
  socials?: string[];
  /** Filenames the owner attached. Recorded only: document parsing is a typed gap (DOCUMENT_INTAKE_TODO). */
  documentNames?: string[];
  /** Override the media authorization check (tests). */
  runMedia?: boolean;
  onProgress?: (stage: LoopStageReport) => void;
  safeFetchDeps?: SafeFetchDeps;
  nowIso?: string;
  /** POST /api/fyd/build receipt time (ISO); recorded as timings.urlSubmittedAt. */
  urlSubmittedAtIso?: string;
}

/**
 * Media authorization: the two explicitly authorized demo businesses,
 * keyed by the source host media may be acquired from. Per the product
 * authority decisions, arbitrary third-party media ingestion needs a
 * rights/policy boundary first; until then the loop refuses (typed
 * skip), never silently generalizes. The boundary attaches to the
 * SOURCE (host), not the tenant label: the intake route derives tenant
 * IDs from the URL hash, so host matching is what lets the authorized
 * demos' media run through [Build My FYD] too.
 */
const AUTHORIZED_MEDIA_HOSTS: Record<string, { businessSlug: string }> = {
  "happy-place-platform.vercel.app": { businessSlug: "happy-place" },
  "www.coppersmithplumbing.com": { businessSlug: "coppersmith" },
  "coppersmithplumbing.com": { businessSlug: "coppersmith" },
};


/** L0 policy gate for the DISCOVER stage: shape + DNS-public check. Fast, no content fetch. */
async function policyGate(rawUrl: string, deps?: SafeFetchDeps): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new LiveAcquisitionError("ACQ_INVALID_URL", "discover", "Not a parseable URL: " + rawUrl.slice(0, 120));
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new LiveAcquisitionError("ACQ_SCHEME_REJECTED", "discover", "Scheme not allowed: " + url.protocol);
  }
  if (url.username || url.password) {
    throw new LiveAcquisitionError("ACQ_CREDENTIAL_URL", "discover", "Credential-bearing URLs are rejected");
  }
  const bare = url.hostname.replace(/^\[|\]$/g, "");
  const dnsLookup = deps?.dnsLookup ?? ((h: string) => lookup(h, { all: true }));
  if (/^\d+\.\d+\.\d+\.\d+$/.test(bare) || bare.includes(":")) {
    if (!isPublicIp(bare)) {
      throw new LiveAcquisitionError("ACQ_PRIVATE_IP", "discover", "IP literal is not public routable space: " + bare);
    }
    return url;
  }
  let addrs: Array<{ address: string }>;
  try {
    addrs = await dnsLookup(url.hostname);
  } catch {
    throw new LiveAcquisitionError("ACQ_DNS_FAILED", "discover", "DNS resolution failed for " + url.hostname);
  }
  if (addrs.length === 0) {
    throw new LiveAcquisitionError("ACQ_DNS_FAILED", "discover", "DNS returned no addresses for " + url.hostname);
  }
  for (const a of addrs) {
    if (!isPublicIp(a.address)) {
      throw new LiveAcquisitionError(
        "ACQ_PRIVATE_IP",
        "discover",
        "DNS for " + url.hostname + " resolves to non-public " + a.address,
      );
    }
  }
  return url;
}

function defaultTenantId(seedUrl: string): string {
  return "live-" + sha256Hex(canonicalEntityUrl(seedUrl)).slice(0, 12);
}

/** One function the media stage runs behind, so a future media module can swap it. */
async function acquireSiteMedia(opts: {
  tenantId: string;
  businessSlug: string;
  pages: string[];
}): Promise<MediaStageSummary> {
  const root = process.cwd();
  const manifest = await ingestSiteMedia({
    siteId: opts.tenantId,
    businessSlug: opts.businessSlug,
    pages: opts.pages,
    publicDir: join(root, "public", "fyd-media"),
    manifestPath: join(root, "src", "fyd", "media", "manifests", opts.tenantId + ".json"),
  });
  const count = (o: string) => manifest.observations.filter((x) => x.outcome === o).length;
  return {
    status: "ok",
    reason: "authorized demo tenant: media acquired with provenance",
    ingested: count("ingested"),
    rejected: count("rejected"),
    failed: count("failed"),
    duplicates: count("duplicate"),
    mediaObjects: manifest.media.length,
  };
}

function platformLabel(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}

function documentIntake(documentNames?: string[]): DocumentIntakeResult[] {
  return (documentNames ?? []).map((name) => ({
    name,
    status: "recorded" as const,
    detail: "Recorded at intake. Document parsing is not wired in this build (DOCUMENT_INTAKE_TODO).",
  }));
}

/**
 * Run the full loop. Returns a LiveLoopResult whose report.error is set on
 * any terminal failure; report.error is null on success. Stages are
 * reported via onProgress as they complete.
 */
export async function runLiveLoop(opts: LiveLoopOptions): Promise<LiveLoopResult> {
  const nowIso = opts.nowIso ?? new Date().toISOString();
  const startedAt = new Date().toISOString();
  const timings: LiveLoopReport["timings"] = {
    urlSubmittedAt: opts.urlSubmittedAtIso ?? null,
    firstMeaningfulObjectAt: null,
    siteSpecReadyAt: null,
    firstRenderAt: null,
  };
  const seedUrl = opts.url.trim();
  const tenantId = opts.tenantId ?? defaultTenantId(seedUrl);
  const controllerId = opts.controllerId ?? "fyd-live-loop";
  const deps = opts.safeFetchDeps;
  const stages: LoopStageReport[] = [];
  const emit = (s: LoopStageReport) => {
    stages.push(s);
    opts.onProgress?.(s);
  };
  const documents = documentIntake(opts.documentNames);
  const fail = (code: AcquisitionFailureCode, stage: LoopStageName, message: string): LiveLoopResult => {
    const last = stages[stages.length - 1];
    if (!last || last.stage !== stage) {
      emit({ stage, status: "failed", detail: message, ms: 0 });
    } else {
      last.status = "failed";
      last.detail = message;
    }
    return {
      report: {
        tenantId,
        seedUrl,
        finalUrl: null,
        startedAt,
        finishedAt: new Date().toISOString(),
        timings,
        stages,
        graphSummary: { objects: 0, relationships: 0, schemas: {} },
        specSummary: null,
        media: null,
        socials: [],
        documents,
        error: { code, stage, message },
      },
      graph: { objects: [], relationships: [] },
      spec: null,
      findings: [],
      renderable: false,
      attestation: null,
      planned: null,
      heroMedia: null,
      galleryMedia: [],
    };
  };

  // ---- DISCOVER ----
  let t0 = Date.now();
  let normalized: URL;
  try {
    normalized = await policyGate(seedUrl, deps);
  } catch (e) {
    if (e instanceof LiveAcquisitionError) return fail(e.code, e.stage, e.message);
    throw e;
  }
  emit({
    stage: "discover",
    status: "ok",
    detail: "L0 policy gate passed for " + normalized.toString() + " (public routable address space confirmed).",
    ms: Date.now() - t0,
  });

  // ---- ACQUIRE ----
  t0 = Date.now();
  const adapter = new StaticAcquisitionAdapter();
  const request: AcquisitionRequest = {
    url: normalized.toString(),
    allowedDomains: [normalized.hostname.replace(/^www\./, "")],
    purpose: "fyd-live-loop intake for tenant " + tenantId,
    allowDiscovery: false,
    pageBudget: 1,
    maxDepth: 0,
  };
  let obs: LiveAcquiredObservation;
  try {
    const observations = await adapter.acquire(
      request,
      {
        maxBodyBytes: 5 * 1024 * 1024,
        timeoutMs: 20000,
        acquisitionTimeoutMs: 90000,
        maxRedirects: 5,
        blockPrivateNetworks: true,
        requireRobotsTxt: true,
        userAgent: "FYD-SocialBot/1.0 (+evidence-bound acquisition)",
        rateLimitPerDomainMs: 0,
        allowedContentTypes: ["text/html"],
        browserWallClockMs: 0,
      },
      deps,
    );
    const first = observations[0] as LiveAcquiredObservation | undefined;
    if (!first) return fail("ACQ_NETWORK_ERROR", "acquire", "Adapter returned no observations");
    obs = first;
  } catch (e) {
    if (e instanceof LiveAcquisitionError) return fail(e.code, e.stage, e.message);
    throw e;
  }
  const finalUrl = obs.finalUrl;
  emit({
    stage: "acquire",
    status: "ok",
    detail:
      "L1 static fetch: HTTP " + obs.statusCode + ", " + obs.bytes + " bytes, " +
      obs.contentType + ", final " + finalUrl + ", evidence sha256:" +
      obs.evidenceHash.slice(0, 12) + ". " + obs.policyNotes.join(" "),
    ms: Date.now() - t0,
  });

  // ---- UNDERSTAND ----
  t0 = Date.now();
  const source: SourceRecord = { url: finalUrl, sourceType: "html", discoveredAt: nowIso };
  const acquired: AcquiredSource = { ...source, raw: obs.html, ok: true, status: obs.statusCode };
  const parsed = await parseRich(acquired);
  const normalizedFacts: ParsedFact[] = normalize(parsed.facts);
  if (normalizedFacts.length === 0) {
    return fail(
      "ACQ_EMPTY_CONTENT",
      "understand",
      "Zero facts extracted from " + finalUrl + ": refusing a presence built from no evidence.",
    );
  }
  const fields: ExtractedField[] = provenance(source, normalizedFacts, nowIso, evidenceRefForFact);
  const entities = parsed.structured?.entities ?? [];
  emit({
    stage: "understand",
    status: "ok",
    detail:
      "parseRich: " + fields.length + " evidence-labeled fields, " + entities.length +
      " structured entities (" +
      entities.map((e) => e.types.join("+")).slice(0, 6).join("; ") +
      (entities.length > 6 ? "; ..." : "") + ").",
    ms: Date.now() - t0,
  });

  // ---- RESOLVE ----
  t0 = Date.now();
  const factsByEntity = new Map<string, ScorableFact[]>();
  for (const f of fields) {
    if (!f.entityId) continue;
    const list = factsByEntity.get(f.entityId) ?? [];
    list.push({ name: f.name, value: f.value });
    factsByEntity.set(f.entityId, list);
  }
  const primaryKey = selectPrimaryBusiness(entities, factsByEntity, finalUrl);
  const scoped = scopeFields(fields, primaryKey);
  const pageResolved = resolve(scoped.pageScope);
  const resolvedEntityFields = new Map<string, ExtractedField[]>();
  for (const [key, group] of scoped.entityFields) resolvedEntityFields.set(key, resolve(group));
  let projected: ProjectedGraph;
  try {
    projected = project(pageResolved, finalUrl, nowIso, controllerId, {
      entities,
      entityFields: resolvedEntityFields,
      relationships: parsed.structured?.relationships ?? [],
      refDrops: parsed.structured?.refDrops ?? [],
      primaryKey,
      pairs: relate(pageResolved),
    });
  } catch (e) {
    return fail("ACQ_NO_GRAPH", "resolve", "project() failed: " + (e instanceof Error ? e.message : String(e)));
  }
  if (projected.objects.length === 0) {
    return fail("ACQ_NO_GRAPH", "resolve", "Projection emitted zero objects for " + finalUrl);
  }

  // Owner-supplied socials: typed as owner input, minted as
  // external_identity objects with links_to edges. The proceduralizer's
  // sameAs path covers site-declared socials; this covers intake-declared.
  const socials: SocialIntakeResult[] = [];
  const extraObjects: PingObject[] = [];
  const extraRels: PingRelationship[] = [];
  const ownerId = projected.objects.find((o) => /business/.test(o.schema))?.id ?? projected.objects[0]?.id;
  for (const raw of opts.socials ?? []) {
    const s = raw.trim();
    if (!s) continue;
    try {
      await policyGate(s, deps);
    } catch (e) {
      socials.push({
        url: s,
        status: "rejected",
        code: e instanceof LiveAcquisitionError ? e.code : "ACQ_INVALID_URL",
        detail: e instanceof Error ? e.message : String(e),
      });
      continue;
    }
    const label = platformLabel(s);
    const extId = (ownerId ?? tenantId) + "-ext-" + sha256Hex(s).slice(0, 12);
    extraObjects.push({
      id: extId,
      schema: "ping.social.external_identity@1",
      controllerId,
      visibility: "public",
      title: label,
      description: "External profile supplied at intake.",
      fields: { url: s, platform: label, claimKind: "owner_statement" },
      createdAt: nowIso,
      updatedAt: nowIso,
      provenance: { kind: "website-derived", ref: "fyd-intake:" + tenantId, derivedAt: nowIso },
    });
    if (ownerId) {
      extraRels.push({
        id: "rel-" + sha256Hex([ownerId, "links_to", extId].join("|")).slice(0, 16),
        subject: ownerId,
        predicate: "links_to",
        object: extId,
        status: "active",
        createdAt: nowIso,
        evidenceRef: "fyd-intake:" + tenantId,
      });
    }
    socials.push({ url: s, status: "accepted", detail: "Policy gate passed; minted as owner-supplied external identity." });
  }
  const fullGraph: ObjectGraph = {
    objects: [...projected.objects, ...extraObjects],
    relationships: [...projected.relationships, ...extraRels],
  };

  // OBJECT BUILDER boundary: verify + attest before the planner sees anything.
  let verified;
  try {
    const projectionLike = { graph: fullGraph, meta: { siteId: tenantId } } as PingProjection;
    verified = verifyObjectGraph({ tenantId }, projectionLike);
  } catch (e) {
    return fail("ACQ_VERIFY_FAILED", "resolve", "Object builder refused the graph: " + (e instanceof Error ? e.message : String(e)));
  }
  emit({
    stage: "resolve",
    status: "ok",
    detail:
      "project(): " + fullGraph.objects.length + " objects, " + fullGraph.relationships.length +
      " relationships; builder attested (" + verified.attestation.checks.join(", ") + "). " +
      socials.filter((s) => s.status === "accepted").length + " intake socials accepted, " +
      socials.filter((s) => s.status === "rejected").length + " rejected.",
    ms: Date.now() - t0,
  });
  if (timings.firstMeaningfulObjectAt === null && fullGraph.objects.length > 0) {
    timings.firstMeaningfulObjectAt = new Date().toISOString();
  }

  // ---- GENERATE ----
  t0 = Date.now();
  let planned: PlannedSite;
  try {
    planned = planSite({
      ctx: { tenantId },
      graph: verified.graph,
      vector: DEFAULT_VECTOR,
      generatedAt: nowIso,
      attestation: verified.attestation,
    });
  } catch (e) {
    return fail("ACQ_PLAN_FAILED", "generate", "Planner failed: " + (e instanceof Error ? e.message : String(e)));
  }
  const knownSchemas = new Set(verified.graph.objects.map((o) => o.schema));
  const findings = validateSiteSpec(planned.spec, knownSchemas);
  const renderable = isRenderable(findings);
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;
  const info = findings.filter((f) => f.severity === "info").length;
  const sections = planned.spec.pages.reduce((n, p) => n + p.sections.length, 0);
  emit({
    stage: "generate",
    status: "ok",
    detail:
      "planSite: " + planned.spec.pages.length + " pages, " + sections + " sections; validator " +
      errors + " errors / " + warnings + " warnings / " + info + " info; renderable=" + renderable +
      "; semantic digest " + planned.semanticDigest.slice(0, 12) + ".",
    ms: Date.now() - t0,
  });
  timings.siteSpecReadyAt = new Date().toISOString();

  // ---- MEDIA ----
  t0 = Date.now();
  let media: MediaStageSummary | null = null;
  const finalHost = (() => {
    try {
      return new URL(finalUrl).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const hostAuth = finalHost ? AUTHORIZED_MEDIA_HOSTS[finalHost] : undefined;
  const mediaAllowed = (opts.runMedia ?? true) && !!hostAuth;
  if (mediaAllowed && hostAuth) {
    try {
      media = await acquireSiteMedia({ tenantId, businessSlug: hostAuth.businessSlug, pages: [finalUrl] });
      emit({
        stage: "media",
        status: "ok",
        detail:
          "Media pipeline: " + media.ingested + " ingested, " + media.rejected + " rights-rejected, " +
          media.failed + " failed, " + media.duplicates + " duplicates.",
        ms: Date.now() - t0,
      });
    } catch (e) {
      media = {
        status: "skipped",
        reason: "Media pipeline failed without taking down the loop: " + (e instanceof Error ? e.message : String(e)),
        ingested: 0, rejected: 0, failed: 0, duplicates: 0, mediaObjects: 0,
      };
      emit({ stage: "media", status: "skipped", detail: media.reason, ms: Date.now() - t0 });
    }
  } else {
    const reason =
      "MEDIA_RIGHTS_SCOPE: host " + (finalHost || "(unknown)") +
      " is not an authorized demo source; media acquisition refused " +
      "(rights/policy boundary pending per product authority decisions).";
    media = { status: "skipped", reason, ingested: 0, rejected: 0, failed: 0, duplicates: 0, mediaObjects: 0 };
    emit({ stage: "media", status: "skipped", detail: reason, ms: Date.now() - t0 });
  }

  // Media objects attach AFTER builder verification: ping.social.media@1
  // is not in the object-builder schema catalog (documented gap; the
  // planner/generator do not consume media objects anyway, the render
  // seam resolves hero/gallery from the manifest).
  let renderGraph: ObjectGraph = verified.graph;
  if (media && media.status === "ok" && media.mediaObjects > 0) {
    try {
      const manifest = readPipelineManifest(tenantId);
      if (manifest) renderGraph = attachMediaToGraph(verified.graph, manifest);
    } catch {
      // Media attach is presentation-side; never fail the loop on it.
    }
  }

  const ownerObjectId = planned.spec.ownerObjectId;
  const heroMedia = heroMediaFor(tenantId, renderGraph, ownerObjectId);
  const galleryAssets = galleryMediaFor(tenantId, renderGraph, ownerObjectId);
  const schemas: Record<string, number> = {};
  for (const o of renderGraph.objects) schemas[o.schema] = (schemas[o.schema] ?? 0) + 1;

  const report: LiveLoopReport = {
    tenantId,
    seedUrl,
    finalUrl,
    startedAt,
    finishedAt: new Date().toISOString(),
    timings,
    stages,
    graphSummary: { objects: renderGraph.objects.length, relationships: renderGraph.relationships.length, schemas },
    specSummary: {
      pages: planned.spec.pages.length,
      sections,
      ownerObjectId,
      semanticDigest: planned.semanticDigest,
      renderable,
      errors,
      warnings,
      info,
    },
    media,
    socials,
    documents,
    error: null,
  };
  return {
    report,
    graph: renderGraph,
    spec: planned.spec,
    findings,
    renderable,
    attestation: verified.attestation,
    planned,
    heroMedia,
    galleryMedia: galleryAssets,
  };
}
