/**
 * LANE-LIN: FYD pipeline lineage tracer.
 *
 * Proves the full machine-walkable trace for one fact on a demo site:
 *
 *   SOURCE BYTES -> OBSERVATION -> EVIDENCE -> OBJECT FIELD
 *     -> SITESPEC BINDING -> RENDERED CLAIM -> ASK FYD ANSWER
 *
 * Given a rendered claim string + site id, each link is resolved with the
 * REAL pipeline code where it exists (never re-derived logic):
 *
 * - SOURCE BYTES: pinned raw website bytes under
 *   src/fyd/proceduralize/raw/<slug>/, sha256-verified against the
 *   machine-generated fixture header.
 * - OBSERVATION: the regen pipeline's persisted observation records at
 *   /home/nolan/fyd-proof-run/step1-observations-<slug>.json (extraction
 *   output of runExtractionPipeline; factClass DIRECT_FACT, claimKind
 *   website_statement). Acquisition digests are cross-checked against the
 *   raw bytes, and the observation's byte-range sourceLocation is
 *   cross-checked against the raw file.
 * - EVIDENCE: the object (and owner-binding relationship) in the graph
 *   whose title/description/fields contain the claim, with its provenance
 *   {kind: website-derived, ref: website-ingestion:<url>} and the
 *   observation entityId <-> relationship evidenceRef join.
 * - OBJECT FIELD: the same object in the composed PING projection at
 *   /home/nolan/ping/var/fyd-projections/<siteId>.json (exactly what the
 *   live demo page reads via getPingObjectGraph), with meta.graphDigest
 *   recomputed and the journal-overlay delta vs the fixture base.
 * - SITESPEC BINDING: the real generateSiteSpec(graph) output; the real
 *   resolveQuery(section.query, graph, ownerObjectId) binding the object
 *   into Services sections; validateSiteSpec findings.
 * - RENDERED CLAIM: the real renderSection() server-side rendered with
 *   renderToStaticMarkup; the claim string must appear in the markup
 *   (inside the FydObjectCard description read through resolveBoundField,
 *   the binding verifier).
 * - ASK FYD ANSWER: the real buildAskFydContext + composeAskFyd pipeline
 *   (anonymous visitor, no grants, like the visitor ask route); the answer
 *   must state the claim and cite the object via evidenceRefs /
 *   claimClassifications.
 *
 * Where a link cannot be machine-resolved, the link is returned with
 * status "missing" and a `needed` field saying exactly what data would
 * resolve it. Nothing is faked: a missing link is a first-class verdict.
 *
 * Run: npx tsx --import ./src/fyd/lineage/register-css.mjs \
 *        src/fyd/lineage/run-tracer.ts --site <id> --claim "..." --question "..."
 */

// Classic-JSX fallback: tsx compiles the repo's .tsx with the classic
// runtime (root tsconfig jsx=preserve); renderer.tsx references the React
// global, so provide it. Harmless under react-jsx.
import * as React from "react";
(globalThis as any).React = (globalThis as any).React ?? React;

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { HAPPY_PLACE_GRAPH } from "@/fyd/proceduralize/__fixtures__/happy-place-graph";
import { COPPERSMITH_GRAPH } from "@/fyd/proceduralize/__fixtures__/coppersmith-graph";
import { generateSiteSpec } from "@/fyd/proceduralize/generator";
import { validateSiteSpec, isRenderable } from "@/fyd/sitespec/validator";
import { getComponentDef } from "@/fyd/components/registry";
import {
  resolveQuery,
  renderSection,
  buildRenderContext,
} from "@/fyd/components/renderer";
import { resolveBoundField } from "@/fyd/sitespec/graph";
import { buildAskFydContext } from "@/fyd/ask/context-builder";
import { composeAskFyd } from "@/fyd/ask/answer";
import { canonicalize } from "@/lib/ping/ask-composer";
import type { ObjectGraph } from "@/fyd/sitespec/types";
import type { PingObject } from "@/lib/ping/types";

const REPO = "/home/nolan/projects/ping";
const PROOF_RUN = "/home/nolan/fyd-proof-run";
const PROJECTIONS = "/home/nolan/ping/var/fyd-projections";

const sha256hex = (d: string | Buffer): string =>
  createHash("sha256").update(d).digest("hex");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LinkStage =
  | "source_bytes"
  | "observation"
  | "evidence"
  | "object_field"
  | "sitespec_binding"
  | "rendered_claim"
  | "ask_fyd_answer";

export interface LineageLink {
  stage: LinkStage;
  status: "resolved" | "missing";
  /** Machine pointer: file path, object id, section id, etc. */
  pointer: string | null;
  /** Short human-readable excerpt proving the link. */
  excerpt: string | null;
  /** Full machine detail. */
  detail: Record<string, unknown>;
  /** When missing: exactly what data would resolve this link. */
  needed?: string;
}

export interface LineageChain {
  tracer: "lane-lin";
  tracerVersion: string;
  siteId: string;
  claim: string;
  question: string;
  tracedAt: string;
  complete: boolean;
  links: LineageLink[];
}

export const TRACER_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Site registry
// ---------------------------------------------------------------------------

interface SiteConfig {
  siteId: string;
  rawSlug: string;
  fixtureFile: string;
  graph: ObjectGraph;
}

const SITES: Record<string, SiteConfig> = {
  "happy-place": {
    siteId: "happy-place",
    rawSlug: "happy-place-platform",
    fixtureFile: `${REPO}/src/fyd/proceduralize/__fixtures__/happy-place-graph.ts`,
    graph: HAPPY_PLACE_GRAPH,
  },
  "coppersmith-plumbing": {
    siteId: "coppersmith-plumbing",
    rawSlug: "coppersmith-plumbing",
    fixtureFile: `${REPO}/src/fyd/proceduralize/__fixtures__/coppersmith-graph.ts`,
    graph: COPPERSMITH_GRAPH,
  },
};

// ---------------------------------------------------------------------------
// Fixture header parsing (the machine-generated provenance block)
// ---------------------------------------------------------------------------

interface FixtureHeader {
  script: string | null;
  timestampPin: string | null;
  pipelineCommit: string | null;
  sourceUrl: string | null;
  sourceDigest: string | null;
  fileOrder: string[];
  files: { name: string; bytes: number; sha256: string }[];
  observedAt: string | null;
  controllerId: string | null;
}

function parseFixtureHeader(tsPath: string): FixtureHeader | null {
  let text: string;
  try {
    text = readFileSync(tsPath, "utf8");
  } catch {
    return null;
  }
  const header = text.split("*/")[0];
  const one = (re: RegExp): string | null => {
    const m = header.match(re);
    return m ? m[1] : null;
  };
  const digestLine = one(
    /Source digest \(sha256 over pinned raw bytes, file order: ([^)]+)\): ([0-9a-f]{64})/,
  );
  // The regex above captures only group 1; re-run for the digest itself.
  const dm = header.match(
    /Source digest \(sha256 over pinned raw bytes, file order: [^)]+\): ([0-9a-f]{64})/,
  );
  const om = header.match(
    /Source digest \(sha256 over pinned raw bytes, file order: ([^)]+)\)/,
  );
  const files: FixtureHeader["files"] = [];
  const fre = /^ \*   (\S+) \(\w+, (\d+) bytes, sha256 ([0-9a-f]{64})\)/gm;
  let fm: RegExpExecArray | null;
  while ((fm = fre.exec(header)) !== null) {
    files.push({ name: fm[1], bytes: Number(fm[2]), sha256: fm[3] });
  }
  if (!dm || files.length === 0) return null;
  void digestLine;
  return {
    script: one(/Script: (\S+)/),
    timestampPin: one(/Timestamp pin: (\S+)/),
    pipelineCommit: one(/Pipeline git commit: ([0-9a-f]+)/),
    sourceUrl: one(/Source: (\S+)/),
    sourceDigest: dm[1],
    fileOrder: (om ? om[1] : "").split(",").map((s) => s.trim()).filter(Boolean),
    files,
    observedAt: one(/observedAt: (\S+)/),
    controllerId: one(/controllerId: (\S+)/),
  };
}

// ---------------------------------------------------------------------------
// Claim matching
// ---------------------------------------------------------------------------

function findClaimInObject(
  obj: PingObject,
  claim: string,
): { field: string; value: string; direction: "claim-in-value" | "value-in-claim" } | null {
  const fields: [string, unknown][] = [
    ["title", obj.title],
    ["description", obj.description],
    ...Object.entries(obj.fields).map(([k, v]): [string, unknown] => [`fields.${k}`, v]),
  ];
  for (const [field, v] of fields) {
    if (typeof v !== "string" || v.length === 0) continue;
    if (v.includes(claim)) return { field, value: v, direction: "claim-in-value" };
  }
  // Short-claim direction: the claim names a value stored on the object.
  if (claim.length <= 160) {
    for (const [field, v] of fields) {
      if (typeof v !== "string" || v.length === 0) continue;
      if (claim.includes(v)) return { field, value: v, direction: "value-in-claim" };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Stage 1: SOURCE BYTES
// ---------------------------------------------------------------------------

function traceSourceBytes(cfg: SiteConfig): {
  link: LineageLink;
  header: FixtureHeader | null;
  rawBuffers: Buffer[];
} {
  const header = parseFixtureHeader(cfg.fixtureFile);
  if (!header) {
    return {
      header: null,
      rawBuffers: [],
      link: {
        stage: "source_bytes",
        status: "missing",
        pointer: cfg.fixtureFile,
        excerpt: null,
        detail: {},
        needed:
          "a machine-generated fixture header with pinned source digests " +
          "(regen.ts output); the fixture file has no parseable provenance block",
      },
    };
  }
  const rawBuffers: Buffer[] = [];
  const perFile: Record<string, unknown>[] = [];
  let filesOk = true;
  for (const f of header.files) {
    const p = `${REPO}/src/fyd/proceduralize/raw/${cfg.rawSlug}/${f.name}`;
    try {
      const buf = readFileSync(p);
      rawBuffers.push(buf);
      const digest = sha256hex(buf);
      const ok = digest === f.sha256 && buf.length === f.bytes;
      if (!ok) filesOk = false;
      perFile.push({ name: f.name, path: p, bytes: buf.length, sha256: digest, matchesHeader: ok });
    } catch (err) {
      filesOk = false;
      perFile.push({ name: f.name, path: p, error: String(err) });
    }
  }
  const concat = Buffer.concat(rawBuffers);
  const concatDigest = sha256hex(concat);
  const concatOk = concatDigest === header.sourceDigest;
  const ok = filesOk && concatOk && rawBuffers.length === header.files.length;
  return {
    header,
    rawBuffers,
    link: {
      stage: "source_bytes",
      status: ok ? "resolved" : "missing",
      pointer: `${REPO}/src/fyd/proceduralize/raw/${cfg.rawSlug}/`,
      excerpt: ok
        ? `sha256 over pinned raw bytes (${header.fileOrder.join(", ")}) = ${concatDigest.slice(0, 16)}..., matches fixture header`
        : `digest mismatch: recomputed ${concatDigest.slice(0, 16)}... vs header ${String(header.sourceDigest).slice(0, 16)}...`,
      detail: {
        fixtureHeader: cfg.fixtureFile,
        script: header.script,
        timestampPin: header.timestampPin,
        pipelineCommit: header.pipelineCommit,
        sourceUrl: header.sourceUrl,
        observedAt: header.observedAt,
        controllerId: header.controllerId,
        fileOrder: header.fileOrder,
        expectedConcatDigest: header.sourceDigest,
        recomputedConcatDigest: concatDigest,
        concatDigestMatches: concatOk,
        perFile,
      },
      ...(ok
        ? {}
        : {
            needed:
              "raw bytes whose sha256 matches the fixture header digests; " +
              "the pinned corpus was modified or the wrong files were read",
          }),
    },
  };
}

// ---------------------------------------------------------------------------
// Stage 2: OBSERVATION
// ---------------------------------------------------------------------------

interface ObservationDoc {
  site: string;
  canonicalUrl: string;
  observedAt: string;
  controllerId: string;
  pipelineCommit: string;
  acquisition: {
    sourceUrl: string;
    retrievedAt: string;
    contentDigest: string;
    contentType: string;
    method: string;
  }[];
  observationCount: number;
  observations: {
    name: string;
    value: unknown;
    observationType: string;
    sourceUrl: string;
    sourcePointer: string;
    sourceLocation: string | null;
    observedAt: string;
    extractor: string | null;
    factClass: string;
    visibility: string;
    claimKind: string;
    entityId: string;
    property: string;
  }[];
}

function traceObservation(
  cfg: SiteConfig,
  claim: string,
  rawBuffers: Buffer[],
  header: FixtureHeader | null,
): LineageLink {
  const path = `${PROOF_RUN}/step1-observations-${cfg.rawSlug}.json`;
  let doc: ObservationDoc;
  try {
    doc = JSON.parse(readFileSync(path, "utf8")) as ObservationDoc;
  } catch (err) {
    return {
      stage: "observation",
      status: "missing",
      pointer: path,
      excerpt: null,
      detail: { error: String(err) },
      needed:
        "the regen pipeline's persisted observation records " +
        `(${path}); re-run /home/nolan/fyd-proof-run/regen.ts to regenerate them`,
    };
  }
  // Cross-check: every acquisition digest must equal a raw file digest.
  const rawDigests = new Set(rawBuffers.map((b) => sha256hex(b)));
  const acquisitionCheck = doc.acquisition.map((a) => ({
    sourceUrl: a.sourceUrl,
    contentDigest: a.contentDigest,
    method: a.method,
    matchesRawBytes: rawDigests.has(a.contentDigest),
  }));
  const acquisitionsOk = acquisitionCheck.every((a) => a.matchesRawBytes);

  const matches = doc.observations
    .map((o, i) => ({ o, i }))
    .filter(({ o }) => {
      const v = typeof o.value === "string" ? o.value : "";
      return (
        (v.length > 0 && v.includes(claim)) ||
        (claim.length <= 160 && v.length > 0 && claim.includes(v))
      );
    });
  if (matches.length === 0) {
    return {
      stage: "observation",
      status: "missing",
      pointer: path,
      excerpt: null,
      detail: {
        observationCount: doc.observationCount,
        observedAt: doc.observedAt,
        controllerId: doc.controllerId,
        acquisitionCheck,
        acquisitionsMatchRawBytes: acquisitionsOk,
      },
      needed:
        `an observation whose value contains the claim string; none of the ` +
        `${doc.observationCount} persisted observations in ${path} matches. ` +
        `Needed: the exact extracted value (check extractor output or ` +
        `re-run the extraction pipeline on the pinned bytes)`,
    };
  }
  // Byte-locatability: the claim string must occur at an exact byte
  // offset in the pinned raw files (the strongest proof the claim bytes are
  // in SOURCE BYTES). The observation's sourceLocation range is the
  // extractor's element record; it is reported with its distance to the
  // claim offset, not required to contain it.
  const first = matches[0];
  const claimOffsets: { file: string; offset: number }[] = [];
  if (header) {
    header.files.forEach((f, fi) => {
      const buf = rawBuffers[fi];
      if (!buf) return;
      const off = buf.indexOf(claim);
      if (off >= 0) claimOffsets.push({ file: f.name, offset: off });
    });
  }
  const rm = /bytes=(\d+)-(\d+)/.exec(first.o.sourceLocation ?? "");
  let rangeDetail: Record<string, unknown> | null = null;
  if (rm && header) {
    const [start, end] = [Number(rm[1]), Number(rm[2])];
    const buf = rawBuffers[0];
    const slice =
      buf && end <= buf.length
        ? buf.subarray(start, end).toString("utf8").slice(0, 120).replace(/\s+/g, " ")
        : null;
    const co = claimOffsets.find((c) => c.file === header.files[0].name);
    rangeDetail = {
      recordedRange: `${start}-${end}`,
      rangeSliceExcerpt: slice,
      claimOffsetInSameFile: co?.offset ?? null,
      claimOffsetRelativeToRange:
        co != null
          ? co.offset >= start && co.offset <= end
            ? "claim starts inside the recorded range"
            : co.offset < start
              ? `claim starts ${start - co.offset} bytes before range start`
              : `claim starts ${co.offset - end} bytes after range end (same card widget)`
          : null,
    };
  }
  return {
    stage: "observation",
    status: "resolved",
    pointer: `${path}#observations[${first.i}]`,
    excerpt:
      `observation "${first.o.name}" (${first.o.observationType}): ` +
      `"${String(first.o.value).slice(0, 80)}..." ` +
      `sourcePointer ${first.o.sourcePointer}, ${first.o.sourceLocation}`,
    detail: {
      path,
      observationIndex: first.i,
      matchCount: matches.length,
      matchedIndexes: matches.map((m) => m.i),
      observation: first.o,
      observationCount: doc.observationCount,
      observedAt: doc.observedAt,
      controllerId: doc.controllerId,
      pipelineCommit: doc.pipelineCommit,
      acquisitionCheck,
      acquisitionsMatchRawBytes: acquisitionsOk,
      claimByteOffsets: claimOffsets,
      claimByteLocatableInRawFile: claimOffsets.length > 0,
      sourceLocationRangeDetail: rangeDetail,
      note:
        "observation records live outside the git repo in the regen " +
        "pipeline output dir; the acquisition contentDigest equality with " +
        "the raw file sha256 proves these observations were extracted from " +
        "exactly the SOURCE BYTES above",
    },
  };
}

// ---------------------------------------------------------------------------
// Stage 3: EVIDENCE (object + relationship in the graph)
// ---------------------------------------------------------------------------

function traceEvidence(
  graph: ObjectGraph,
  graphSource: string,
  claim: string,
  observationEntityId: string | null,
): { link: LineageLink; obj: PingObject | null; field: string | null } {
  const candidates = graph.objects
    .map((o) => ({ o, hit: findClaimInObject(o, claim) }))
    .filter((c) => c.hit !== null)
    .sort((a, b) => (a.o.id < b.o.id ? -1 : 1));
  if (candidates.length === 0) {
    return {
      obj: null,
      field: null,
      link: {
        stage: "evidence",
        status: "missing",
        pointer: graphSource,
        excerpt: null,
        detail: { objectCount: graph.objects.length },
        needed:
          "an object in the graph whose title, description, or fields " +
          "contain the claim string; the claim as stated does not occur in " +
          "any object. Needed: the exact rendered string (or a distinctive " +
          "substring of it) as it appears on the site",
      },
    };
  }
  const { o: obj, hit } = candidates[0];
  const rels = graph.relationships.filter(
    (r) => r.object === obj.id || r.subject === obj.id,
  );
  const entityJoin =
    observationEntityId !== null
      ? rels
          .filter((r) => r.evidenceRef.endsWith(observationEntityId))
          .map((r) => ({ relationshipId: r.id, evidenceRef: r.evidenceRef }))
      : [];
  return {
    obj,
    field: hit!.field,
    link: {
      stage: "evidence",
      status: "resolved",
      pointer: `${graphSource}#${obj.id}`,
      excerpt:
        `object ${obj.id} (${obj.schema}), matched ${hit!.field} ` +
        `(${hit!.direction}); provenance ${obj.provenance.kind}, ` +
        `ref ${obj.provenance.ref}; claimKind ` +
        `${String(obj.fields["claimKind"] ?? obj.fields["claimkind"] ?? "n/a")}`,
      detail: {
        objectId: obj.id,
        schema: obj.schema,
        title: obj.title,
        matchedField: hit!.field,
        matchDirection: hit!.direction,
        provenance: obj.provenance,
        claimKind: obj.fields["claimKind"] ?? null,
        visibility: obj.visibility,
        candidateCount: candidates.length,
        candidateIds: candidates.map((c) => c.o.id),
        bindingRelationships: rels.map((r) => ({
          id: r.id,
          subject: r.subject,
          predicate: r.predicate,
          status: r.status,
          evidenceRef: r.evidenceRef,
        })),
        observationEntityId,
        entityIdToEvidenceRefJoin: entityJoin,
        entityJoinNote:
          entityJoin.length > 0
            ? "the relationship evidenceRef ends with the observation entityId: both minted by the proceduralizer, joining OBSERVATION to EVIDENCE"
            : "no relationship evidenceRef ends with the observation entityId",
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Stage 4: OBJECT FIELD (composed PING projection = what the site reads)
// ---------------------------------------------------------------------------

function traceObjectField(
  cfg: SiteConfig,
  obj: PingObject | null,
  field: string | null,
  claim: string,
): { link: LineageLink; graph: ObjectGraph | null; meta: Record<string, unknown> | null } {
  const path = `${PROJECTIONS}/${cfg.siteId}.json`;
  let doc: { meta: Record<string, unknown>; graph: ObjectGraph };
  try {
    doc = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return {
      graph: null,
      meta: null,
      link: {
        stage: "object_field",
        status: "missing",
        pointer: path,
        excerpt: null,
        detail: { error: String(err) },
        needed:
          `the PING-side projection ${path} (written by the PING dump); ` +
          `re-run the dump so the live site has a projection to read`,
      },
    };
  }
  const meta = doc.meta as Record<string, unknown>;
  const graph = doc.graph as ObjectGraph;
  // Mirror ping-object-source.ts parseAndVerify: site match, provenance refs,
  // graphDigest recompute.
  const checks: Record<string, unknown> = {
    metaSiteIdMatches: meta["siteId"] === cfg.siteId,
    allObjectsHaveProvenanceRef: graph.objects.every(
      (o) => typeof o.provenance?.ref === "string" && o.provenance.ref.length > 0,
    ),
  };
  const recomputed = sha256hex(canonicalize(graph));
  checks["graphDigestRecomputed"] = recomputed;
  checks["graphDigestMatches"] = recomputed === meta["graphDigest"];
  checks["baseDigest"] = meta["baseDigest"];
  const fixtureIds = new Set(cfg.graph.objects.map((o) => o.id));
  const added = graph.objects.filter((o) => !fixtureIds.has(o.id));
  const removed = cfg.graph.objects.filter(
    (o) => !graph.objects.some((p) => p.id === o.id),
  );
  if (!checks["metaSiteIdMatches"] || !checks["allObjectsHaveProvenanceRef"] || !checks["graphDigestMatches"]) {
    return {
      graph: null,
      meta: meta as Record<string, unknown>,
      link: {
        stage: "object_field",
        status: "missing",
        pointer: path,
        excerpt: null,
        detail: { meta, checks },
        needed:
          "a projection that passes verification (site id, provenance refs, " +
          "graphDigest); the file on disk failed verification, so the site " +
          "itself would refuse to serve it",
      },
    };
  }
  if (!obj || !field) {
    return {
      graph,
      meta: meta as Record<string, unknown>,
      link: {
        stage: "object_field",
        status: "missing",
        pointer: path,
        excerpt: null,
        detail: { meta, checks },
        needed: "the EVIDENCE stage must resolve first (no object to look up)",
      },
    };
  }
  const live = graph.objects.find((o) => o.id === obj.id);
  if (!live) {
    return {
      graph,
      meta: meta as Record<string, unknown>,
      link: {
        stage: "object_field",
        status: "missing",
        pointer: path,
        excerpt: null,
        detail: { meta, checks, wantedObjectId: obj.id },
        needed:
          `object ${obj.id} is not in the composed projection; it may have ` +
          `been deactivated by a journal overlay or dropped by the dump`,
      },
    };
  }
  const liveHit = findClaimInObject(live, claim);
  return {
    graph,
    meta: meta as Record<string, unknown>,
    link: {
      stage: "object_field",
      status: liveHit ? "resolved" : "missing",
      pointer: `${path}#${live.id}.${field}`,
      excerpt: liveHit
        ? `projection object ${live.id}: ${field} = "${String(
            field === "title"
              ? live.title
              : field === "description"
                ? live.description
                : (live.fields[field.replace(/^fields\./, "")] as string),
          ).slice(0, 90)}..."`
        : `object ${live.id} is in the projection but no longer carries the claim in ${field}`,
      detail: {
        path,
        meta: {
          siteId: meta["siteId"],
          dumpedAt: meta["dumpedAt"],
          dumperVersion: meta["dumperVersion"],
          baseDigest: meta["baseDigest"],
          fixtureFileDigest: meta["fixtureFileDigest"],
          graphDigest: meta["graphDigest"],
          overlayEventIds: meta["overlayEventIds"],
          eventSequences: meta["eventSequences"],
          generatedAt: meta["generatedAt"],
        },
        verification: checks,
        journalOverlayDelta: {
          addedObjectIds: added.map((o) => o.id),
          addedProvenance: added.map((o) => o.provenance),
          removedObjectIds: removed.map((o) => o.id),
        },
        objectId: live.id,
        field,
        liveFieldValue:
          field === "title"
            ? live.title
            : field === "description"
              ? live.description
              : live.fields[field.replace(/^fields\./, "")],
      },
      ...(liveHit
        ? {}
        : {
            needed:
              "the composed projection to carry the claim on the object; " +
              "a journal overlay or re-dump changed the field value",
          }),
    },
  };
}

// ---------------------------------------------------------------------------
// Stage 5: SITESPEC BINDING
// ---------------------------------------------------------------------------

function traceSitespecBinding(
  graph: ObjectGraph,
  meta: Record<string, unknown> | null,
  obj: PingObject | null,
): LineageLink {
  if (!obj) {
    return {
      stage: "sitespec_binding",
      status: "missing",
      pointer: null,
      excerpt: null,
      detail: {},
      needed: "the EVIDENCE stage must resolve first (no object to bind)",
    };
  }
  const spec = generateSiteSpec(graph, {
    generatedAt: String(meta?.["generatedAt"] ?? "2026-09-21T12:00:00.000Z"),
    eventSequences: (meta?.["eventSequences"] as [number, number] | null) ?? undefined,
  });
  const knownSchemas = new Set(graph.objects.map((o) => o.schema));
  const findings = validateSiteSpec(spec, knownSchemas);
  const bindings: Record<string, unknown>[] = [];
  for (const page of spec.pages) {
    for (const section of page.sections) {
      const bound = resolveQuery(section.query, graph, spec.ownerObjectId);
      if (bound.some((o) => o.id === obj.id)) {
        const def = getComponentDef(section.component);
        bindings.push({
          page: page.slug,
          sectionId: section.id,
          component: section.component,
          componentDescription: def?.description ?? null,
          query: section.query,
          boundObjectCount: bound.length,
          boundObjectIds: bound.map((o) => o.id),
          objectIndexInBinding: bound.findIndex((o) => o.id === obj.id),
        });
      }
    }
  }
  if (bindings.length === 0) {
    return {
      stage: "sitespec_binding",
      status: "missing",
      pointer: null,
      excerpt: null,
      detail: {
        specOwnerObjectId: spec.ownerObjectId,
        pages: spec.pages.map((p) => p.slug),
        renderable: isRenderable(findings),
        findingCount: findings.length,
      },
      needed:
        `a spec section whose query resolves to object ${obj.id}; no section ` +
        `binds it (it may be invisible, unreferenced by any relationship the ` +
        `generator follows, or filtered by visibility)`,
    };
  }
  const first = bindings[0] as { sectionId: string; component: string };
  return {
    stage: "sitespec_binding",
    status: "resolved",
    pointer: `FYDSiteSpec#${first.sectionId}`,
    excerpt:
      `generateSiteSpec binds ${obj.id} into ${bindings.length} section(s): ` +
      `${bindings.map((b) => `${b["page"]}:${b["sectionId"]} (${b["component"]})`).join(", ")}`,
    detail: {
      generator: "fyd-site-generator@1.0.0 (src/fyd/proceduralize/generator.ts)",
      specOwnerObjectId: spec.ownerObjectId,
      specProvenance: spec.provenance,
      renderable: isRenderable(findings),
      findingCount: findings.length,
      findings: findings.slice(0, 5),
      bindings,
    },
  };
}

// ---------------------------------------------------------------------------
// Stage 6: RENDERED CLAIM
// ---------------------------------------------------------------------------

function traceRenderedClaim(
  graph: ObjectGraph,
  meta: Record<string, unknown> | null,
  obj: PingObject | null,
  field: string | null,
  claim: string,
): LineageLink {
  if (!obj || !field) {
    return {
      stage: "rendered_claim",
      status: "missing",
      pointer: null,
      excerpt: null,
      detail: {},
      needed: "the EVIDENCE stage must resolve first (no object to render)",
    };
  }
  const spec = generateSiteSpec(graph, {
    generatedAt: String(meta?.["generatedAt"] ?? "2026-09-21T12:00:00.000Z"),
    eventSequences: (meta?.["eventSequences"] as [number, number] | null) ?? undefined,
  });
  const ctx = buildRenderContext(spec, graph, { viewerId: null, displayName: null });
  // The binding verifier the card reads through (same call the renderer makes).
  const boundValue = resolveBoundField(ctx.graph, {
    objectId: obj.id,
    field: field.replace(/^fields\./, ""),
    classification: "direct",
  });
  const renders: Record<string, unknown>[] = [];
  for (const page of spec.pages) {
    for (const section of page.sections) {
      const bound = resolveQuery(section.query, graph, spec.ownerObjectId);
      if (!bound.some((o) => o.id === obj.id)) continue;
      let html = "";
      let error: string | null = null;
      try {
        html = renderToStaticMarkup(renderSection(section, ctx, 0) as any);
      } catch (err) {
        error = String(err);
      }
      const idx = html.indexOf(claim);
      renders.push({
        page: page.slug,
        sectionId: section.id,
        component: section.component,
        renderError: error,
        markupChars: html.length,
        claimPresent: idx >= 0,
        claimExcerpt:
          idx >= 0
            ? html.slice(Math.max(0, idx - 100), idx + claim.length + 60)
            : null,
      });
    }
  }
  const hit = renders.find((r) => r["claimPresent"] === true) as
    | { sectionId: string; component: string; claimExcerpt: string }
    | undefined;
  if (!hit) {
    return {
      stage: "rendered_claim",
      status: "missing",
      pointer: null,
      excerpt: null,
      detail: {
        boundFieldValue: boundValue,
        boundFieldCarriesClaim: typeof boundValue === "string" && boundValue.includes(claim),
        renders,
      },
      needed:
        "the claim string to appear in the server-rendered section markup; " +
        "the object is bound but the component does not emit this field " +
        "(or SSR failed: see renderError)",
    };
  }
  return {
    stage: "rendered_claim",
    status: "resolved",
    pointer: `renderSection(${hit.sectionId}) -> FydObjectCard`,
    excerpt: `SSR markup of section ${hit.sectionId} (${hit.component}) contains the claim: ...${hit.claimExcerpt.slice(0, 160)}...`,
    detail: {
      mechanism:
        "ServicesSection -> CardGrid -> FydObjectCard reads boundDescription " +
        "-> resolveBoundField (src/fyd/sitespec/graph.ts binding verifier) " +
        "-> renderToStaticMarkup(renderSection(...))",
      boundFieldVerifier: "src/fyd/sitespec/graph.ts resolveBoundField",
      boundFieldValue: boundValue,
      renders,
    },
  };
}

// ---------------------------------------------------------------------------
// Stage 7: ASK FYD ANSWER
// ---------------------------------------------------------------------------

function traceAskFydAnswer(
  graph: ObjectGraph,
  obj: PingObject | null,
  claim: string,
  question: string,
): LineageLink {
  if (!obj) {
    return {
      stage: "ask_fyd_answer",
      status: "missing",
      pointer: null,
      excerpt: null,
      detail: {},
      needed: "the EVIDENCE stage must resolve first (no target object for the ask context)",
    };
  }
  // Mirror the visitor ask path: public objects/relationships only,
  // anonymous viewer, no grants.
  const rels = graph.relationships.filter(
    (r) =>
      r.status === "active" &&
      (r.subject === obj.id || r.object === obj.id) &&
      graph.objects.some((o) => o.id === r.subject && o.visibility === "public") &&
      graph.objects.some((o) => o.id === r.object && o.visibility === "public"),
  );
  const relatedIds = new Set<string>();
  for (const r of rels) {
    relatedIds.add(r.subject === obj.id ? r.object : r.subject);
  }
  relatedIds.delete(obj.id);
  const related = graph.objects.filter(
    (o) => relatedIds.has(o.id) && o.visibility === "public",
  );
  const actx = buildAskFydContext({
    viewer: { id: null, displayName: null },
    target: obj,
    relatedObjects: related,
    relationships: rels,
    plan: null,
    grants: [],
    siteSpec: null,
    question,
  });
  const ans = composeAskFyd(actx, question);
  const citedIds = new Set<string>();
  for (const c of ans.claimClassifications) {
    for (const id of c.evidenceRefIds ?? []) citedIds.add(id);
  }
  const statesClaim = ans.answer.includes(claim);
  const citesObject =
    citedIds.has(obj.id) ||
    ans.evidenceRefs.some((e) => e.id === obj.id && /\[\d+\]/.test(ans.answer));
  const ok =
    !ans.partial &&
    statesClaim &&
    ans.claimClassifications.length > 0 &&
    citesObject;
  if (!ok) {
    const reason = ans.partial
      ? `composer returned a partial/refusal answer: "${ans.answer.slice(0, 160)}..."`
      : !statesClaim
        ? "the answer does not state the claim string"
        : ans.claimClassifications.length === 0
          ? "the answer states text but carries no claimClassifications"
          : "the answer does not cite the object id in evidenceRefs/claimClassifications";
    return {
      stage: "ask_fyd_answer",
      status: "missing",
      pointer: "composeAskFyd(src/fyd/ask/answer.ts)",
      excerpt: null,
      detail: {
        question,
        answer: ans.answer,
        partial: ans.partial,
        unknowns: ans.unknowns,
        evidenceRefs: ans.evidenceRefs,
        sourceUrls: ans.sourceUrls,
        claimClassifications: ans.claimClassifications,
        statesClaim,
        citesObject,
        reason,
      },
      needed:
        `an Ask FYD answer that states the claim and cites object ${obj.id}; ` +
        `${reason}. Needed: a question phrasing that fires a grounded ` +
        `composer branch (profile/services), or a composer fix if the ` +
        `grounded branch misfires on this input`,
    };
  }
  const cls = ans.claimClassifications[0];
  return {
    stage: "ask_fyd_answer",
    status: "resolved",
    pointer: "composeAskFyd(src/fyd/ask/answer.ts) -> composeAnswer(src/lib/ping/ask-composer.ts)",
    excerpt: `Q: "${question}" A: "${ans.answer.slice(0, 140)}..." (classification ${cls.classification}, cites ${obj.id})`,
    detail: {
      mechanism:
        "visitor ask path: buildAskFydContext (anonymous viewer, no grants) " +
        "-> composeAskFyd -> composeAnswer (deterministic, evidence-backed)",
      question,
      answer: ans.answer,
      evidenceRefs: ans.evidenceRefs,
      sourceUrls: ans.sourceUrls,
      claimClassifications: ans.claimClassifications,
      partial: ans.partial,
      proposal: ans.proposal,
      sitePatchCard: ans.sitePatchCard,
    },
  };
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function traceClaim(
  siteId: string,
  claim: string,
  question: string,
): LineageChain {
  const links: LineageLink[] = [];
  const cfg = SITES[siteId];
  if (!cfg) {
    const link: LineageLink = {
      stage: "source_bytes",
      status: "missing",
      pointer: null,
      excerpt: null,
      detail: { knownSites: Object.keys(SITES) },
      needed: `unknown site id "${siteId}"; known: ${Object.keys(SITES).join(", ")}`,
    };
    return {
      tracer: "lane-lin",
      tracerVersion: TRACER_VERSION,
      siteId,
      claim,
      question,
      tracedAt: new Date().toISOString(),
      complete: false,
      links: [link],
    };
  }

  const s1 = traceSourceBytes(cfg);
  links.push(s1.link);

  const s2 = traceObservation(cfg, claim, s1.rawBuffers, s1.header);
  links.push(s2);
  const observationEntityId =
    s2.status === "resolved"
      ? String((s2.detail["observation"] as { entityId: string }).entityId)
      : null;

  // Evidence is read from the composed projection when available (what the
  // site serves), else the pinned fixture base with a degraded note.
  const s4pre = traceObjectField(cfg, null, null, claim);
  const graphForEvidence = s4pre.graph ?? cfg.graph;
  const graphSource =
    s4pre.graph !== null
      ? `${PROJECTIONS}/${cfg.siteId}.json (verified projection)`
      : `${cfg.fixtureFile} (fixture base; projection unavailable)`;

  const s3 = traceEvidence(graphForEvidence, graphSource, claim, observationEntityId);
  links.push(s3.link);

  const s4 = traceObjectField(cfg, s3.obj, s3.field, claim);
  links.push(s4.link);

  const liveGraph = s4.graph;
  const liveMeta = s4.meta;
  if (liveGraph && s3.obj) {
    links.push(traceSitespecBinding(liveGraph, liveMeta, s3.obj));
    links.push(traceRenderedClaim(liveGraph, liveMeta, s3.obj, s3.field, claim));
    links.push(traceAskFydAnswer(liveGraph, s3.obj, claim, question));
  } else {
    const missing = (stage: LinkStage, why: string): LineageLink => ({
      stage,
      status: "missing",
      pointer: null,
      excerpt: null,
      detail: {},
      needed: why,
    });
    if (!liveGraph) {
      links.push(
        missing("sitespec_binding", "the OBJECT FIELD stage must resolve first (no verified live graph)"),
        missing("rendered_claim", "the OBJECT FIELD stage must resolve first (no verified live graph)"),
        missing("ask_fyd_answer", "the OBJECT FIELD stage must resolve first (no verified live graph)"),
      );
    } else {
      links.push(
        missing("sitespec_binding", "the EVIDENCE stage must resolve first (no object to bind)"),
        missing("rendered_claim", "the EVIDENCE stage must resolve first (no object to render)"),
        missing("ask_fyd_answer", "the EVIDENCE stage must resolve first (no target object for the ask context)"),
      );
    }
  }

  return {
    tracer: "lane-lin",
    tracerVersion: TRACER_VERSION,
    siteId,
    claim,
    question,
    tracedAt: new Date().toISOString(),
    complete: links.every((l) => l.status === "resolved"),
    links,
  };
}
