/**
 * sites-render-audit.ts
 *
 * Observation-only binding verification for the /sites demo render path.
 *
 * Context (QA-TRUTH 2026-09-23, failures F-001..F-003): the /sites demo
 * pages (src/app/sites/[tenant]/page.tsx) call generateSiteSpec directly and never
 * pass through the planner's verification seam, so the BindingVerifier saw
 * 0 percent of their claims by construction (root cause R-A).
 * Renderer-injected factual strings (footer provenance, rights-basis steps,
 * contact provenance wording) live outside the PresentationBinding model
 * entirely (R-B), and the evidence-state to UI-wording layer overclaims
 * (R-C). LANE-CLAIM (R-MODEL) showed nothing re-verifies at render time:
 * tampering the graph after model build publishes the tampered value.
 *
 * This module closes R-A as an OBSERVATION tap, not a gate:
 *
 * - auditSitesRenderClaims(spec, graph, siteId) derives the factual atoms
 *   the page will present (owner identity plus every object each section
 *   query resolves) as PresentationBindings and runs each through the
 *   STRONG verifyBinding (sitespec/binding-verifier.ts), the same verifier
 *   the planner's emission seam uses. It NEVER throws and NEVER mutates
 *   the spec, the findings, or the rendered output.
 * - RENDERER_INJECTED_CLAIMS is the static registry of factual strings the
 *   renderer injects outside the binding model (R-B). Each entry names its
 *   location, its template, its allowed evidence basis, and its fix state,
 *   so the full claim surface is enumerated even where the binding model
 *   cannot reach.
 * - logSitesRenderAudit emits one structured server-log line per render.
 *
 * Why not a gate: the /sites/happy-place route is the frozen golden donor
 * for CLONE-PROVE. A fail-closed gate here would change the route's
 * composed semantics the first time any atom grades UNBOUND (the page
 * would fail instead of rendering). Promoting this tap to a gate is a
 * post-thaw decision; see WIRE-SPEC.md.
 *
 * Determinism: pure function of (spec, graph, siteId). The report
 * timestamp is spec.generator.generatedAt, never the clock. No I/O except
 * the explicit log call, which the page wraps in try/catch.
 */

import {
  ownerAssertionsFromGraph,
  verifyBinding,
} from "./binding-verifier";
import type { PresentationBinding } from "./graph";
import type { FYDQuery, FYDSiteSpec, ObjectGraph } from "./types";
import type { PingObject } from "@/lib/ping/types";
import { ownerRelationshipTarget } from "./schema-roles";

/**
 * Resolve a section query to its public objects.
 *
 * Mirrors renderer.resolveQuery (src/fyd/components/renderer.tsx) so the
 * audit enumerates exactly the objects the page will present. This is a
 * claim enumerator, not a truth authority: the verifier stays the
 * authority. If the query kinds change, update both; a parity test is a
 * follow-up.
 */
function resolveAuditObjects(
  query: FYDQuery,
  graph: ObjectGraph,
  ownerId: string,
): PingObject[] {
  const byId = new Map(graph.objects.map((o) => [o.id, o]));
  const pub = (o: PingObject) => o.visibility === "public";
  switch (query.kind) {
    case "owner": {
      const owner = byId.get(ownerId);
      return owner && pub(owner) ? [owner] : [];
    }
    case "reference": {
      return query.objectIds
        .map((id) => byId.get(id))
        .filter((o): o is PingObject => !!o && pub(o));
    }
    case "related": {
      // Direction-agnostic, deduped: mirrors renderer.resolveQuery exactly.
      const predicates = query.predicates ?? [query.predicate];
      const seen = new Set<string>();
      const out: PingObject[] = [];
      for (const r of graph.relationships) {
        if (!predicates.includes(r.predicate)) continue;
        const memberId = ownerRelationshipTarget(r, query.from);
        if (memberId === null || seen.has(memberId)) continue;
        const target = byId.get(memberId);
        const schemaOk =
          !query.schema && !query.schemas
            ? true
            : query.schema
              ? target?.schema === query.schema
              : query.schemas?.includes(target?.schema ?? "");
        if (target && pub(target) && schemaOk) {
          seen.add(memberId);
          out.push(target);
        }
      }
      out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return query.limit ? out.slice(0, query.limit) : out;
    }
    case "all": {
      const schemaOk = (o: PingObject) =>
        !query.schema && !query.schemas
          ? true
          : query.schema
            ? o.schema === query.schema
            : (query.schemas ?? []).includes(o.schema);
      const out = graph.objects.filter((o) => pub(o) && schemaOk(o));
      out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      return query.limit ? out.slice(0, query.limit) : out;
    }
    case "static":
      return [];
  }
}

/**
 * Derive the factual atoms the /sites page will present as
 * PresentationBindings: the owner identity plus title/description of every
 * object each section query resolves, bound as direct (website statement)
 * bindings. Contact-method values are not duplicated here: the renderer
 * enforces the strong verifier on them directly (resolveBoundFieldVerified),
 * and their wording is covered by the injected-claims registry.
 */
export function deriveSpecBindings(
  spec: FYDSiteSpec,
  graph: ObjectGraph,
): PresentationBinding[] {
  const seen = new Set<string>();
  const out: PresentationBinding[] = [];
  const push = (objectId: string, field: string) => {
    const key = objectId + "::" + field;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ objectId, field, classification: "direct" });
  };
  const owner = graph.objects.find((o) => o.id === spec.ownerObjectId);
  if (owner && owner.visibility === "public") {
    push(owner.id, "title");
    push(owner.id, "description");
  }
  for (const page of spec.pages) {
    for (const section of page.sections) {
      const objects = resolveAuditObjects(section.query, graph, spec.ownerObjectId);
      for (const o of objects) {
        push(o.id, "title");
        push(o.id, "description");
      }
    }
  }
  return out;
}

/**
 * One factual string the renderer injects outside the PresentationBinding
 * model (QA-TRUTH R-B). The registry enumerates the full claim surface the
 * binding audit cannot reach, with the evidence basis each string is
 * allowed to claim and its fix state.
 */
export interface RendererInjectedClaim {
  /** Stable id for tests and logs. */
  id: string;
  /** File and component that injects the string. */
  location: string;
  /** The factual string, as a template with {placeholders}. */
  template: string;
  /** The evidence basis the string is allowed to claim. */
  basis: string;
  /** Fix state relative to QA-TRUTH 2026-09-23. */
  fixState: string;
}

export const RENDERER_INJECTED_CLAIMS: readonly RendererInjectedClaim[] = [
  {
    id: "footer-provenance",
    location: "src/app/sites/_shared/site-client.tsx (provenance footer)",
    template:
      "Generated by FYD Social from a {source} object graph{(acceptance sequences a-b)?}. All claims on this page are website statements, never verified fact.",
    basis:
      "Spec-derived: renders spec.provenance verbatim after P-1. The eventSequences parenthetical is data, never hardcoded.",
    fixState: "FIXED by sites-wire-p1 (was hardcoded, F-001).",
  },
  {
    id: "rights-basis-step",
    location:
      "src/fyd/components/renderer.tsx (HeroMediaWhyThis, GalleryMediaWhyThis)",
    template: "Rights basis: {classifyRights sentence}",
    basis:
      "Policy inference from the classifyRights URL heuristic, not an observation. Must render with state inferred, never observed.",
    fixState:
      "STATE FIXED by sites-wire-p2 (F-002 misgrade). Sentence rewrite deferred to the media lane with manifest re-acquisition.",
  },
  {
    id: "contact-provenance-line",
    location:
      "src/fyd/components/contact-link.tsx (compactProvenanceLine)",
    template: "{Observed|Inferred from|Unverified} {receipt} {· N sources}",
    basis:
      "Evidence-state to wording map. State observed currently renders as Verified, which overclaims and contradicts the footer.",
    fixState:
      "DEFERRED until golden thaw (changes golden DOM). See WIRE-SPEC.md section 9 and the deferred diff in section 11.",
  },
  {
    id: "demo-banner",
    location: "src/app/sites/_shared/site-client.tsx (header)",
    template: "FYD Social / Generated site demo / Procedural clone proof",
    basis:
      "Process fact about the page itself: the page is procedurally generated from the projection via generateSiteSpec; no hand layout exists.",
    fixState: "SUPPORTED. No change needed.",
  },
  {
    id: "askfyd-answer-scope",
    location: "src/fyd/components/renderer.tsx (AskFYD section)",
    template:
      "Answers come only from this site's published information, with sources shown.",
    basis:
      "Pipeline design contract: visitor-answer.ts answers from public objects only, refuses without cited evidence.",
    fixState: "SUPPORTED. No change needed.",
  },
];

export interface AuditedBindingVerdict {
  objectId: string;
  field: string;
  status: "BOUND" | "UNBOUND";
  /** source=... on BOUND, reason=... on UNBOUND. */
  detail: string;
}

export interface SitesRenderAudit {
  siteId: string;
  /** Deterministic: the spec's own generation stamp, never the clock. */
  generatedAt: string;
  bindings: AuditedBindingVerdict[];
  injectedClaims: RendererInjectedClaim[];
  summary: { total: number; bound: number; unbound: number };
}

/**
 * Run the /sites render's claims through the STRONG BindingVerifier.
 * Observation only: never throws (per-binding try/catch), never mutates
 * anything. UNBOUND verdicts are data for the log, not a render decision.
 */
export function auditSitesRenderClaims(
  spec: FYDSiteSpec,
  graph: ObjectGraph,
  siteId: string,
): SitesRenderAudit {
  const assertions = ownerAssertionsFromGraph(graph);
  const bindings: AuditedBindingVerdict[] = deriveSpecBindings(spec, graph).map(
    (b) => {
      try {
        const v = verifyBinding(b, graph, assertions);
        return {
          objectId: b.objectId,
          field: b.field,
          status: v.status,
          detail:
            v.status === "BOUND"
              ? "source=" + v.source
              : "reason=" + v.reason,
        };
      } catch (err) {
        return {
          objectId: b.objectId,
          field: b.field,
          status: "UNBOUND" as const,
          detail:
            "audit-error: " + (err instanceof Error ? err.message : String(err)),
        };
      }
    },
  );
  const unbound = bindings.filter((b) => b.status === "UNBOUND").length;
  return {
    siteId,
    generatedAt: spec.generator.generatedAt,
    bindings,
    injectedClaims: [...RENDERER_INJECTED_CLAIMS],
    summary: {
      total: bindings.length,
      bound: bindings.length - unbound,
      unbound,
    },
  };
}

/** One structured server-log line per render. Never throws. */
export function logSitesRenderAudit(audit: SitesRenderAudit): void {
  console.info("[fyd:sites-render-audit] " + JSON.stringify(audit));
}
