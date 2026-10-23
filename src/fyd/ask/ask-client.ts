/**
 * Canonical Ask FYD client: the ONE client-side orchestration path.
 *
 * Every FYD ask surface (tenant-site widget, homepage dock, object panel,
 * spatial panel, identity inline ask, circle ask, edge embed, capability
 * runtime) reaches the Ask FYD pipeline through this module and the
 * trusted-path route POST /api/fyd/ask/[siteId] only. The tenant comes
 * from the route path, never from a body claim; the legacy flat route
 * (POST /api/fyd/ask) is deprecated and no client posts to it anymore.
 *
 * The server pipeline (src/app/api/fyd/ask/ask-pipeline.ts) remains the
 * single intent/context router: tenant context -> object scope inside
 * that tenant's public graph -> evidence-bounded answer. This module is
 * transport only: it never invents an answer, and every failure returns
 * as a structured non-ok result (fail closed). An AbortError is rethrown
 * untouched: callers with their own request guards treat aborts as
 * control flow, never as errors.
 */
import type { AskFydCitation } from "./visitor-answer";

export interface AskFydPageContext {
  visibleObjectIds: string[];
  contextObjectId: string | null;
}

export interface AskFydRequest {
  /** Tenant slug; becomes the route path segment (the trusted tenant). */
  siteId: string;
  /** Optional object scope inside the tenant's public graph. */
  objectId?: string;
  question: string;
  mode?: "visitor" | "owner";
  pageContext?: AskFydPageContext;
  pageCheckpoint?: string;
  signal?: AbortSignal;
}

export type AskFydResponseClass = "ANSWER" | "DENIAL" | "PREMISE_REJECTED";

export interface AskFydResult {
  ok: boolean;
  /** HTTP status of the pipeline response; 0 when the request never landed. */
  status: number;
  /** True when the failure was transport-level (no usable server response). */
  transportError: boolean;
  answer?: string;
  refusal?: boolean;
  responseClass?: AskFydResponseClass;
  citations?: AskFydCitation[];
  unknowns?: string[];
  kind?: string;
  answerCheckpoint?: string;
  error?: string;
  tenantId?: string;
  raw?: Record<string, unknown>;
}

/** The trusted-path route for a tenant. The only ask URL clients build. */
export function askFydPath(siteId: string): string {
  return "/api/fyd/ask/" + encodeURIComponent(siteId);
}

export async function askFydQuestion(req: AskFydRequest): Promise<AskFydResult> {
  let res: Response;
  try {
    res = await fetch(askFydPath(req.siteId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        question: req.question,
        ...(req.objectId ? { objectId: req.objectId } : {}),
        mode: req.mode ?? "visitor",
        ...(req.pageContext ? { pageContext: req.pageContext } : {}),
        ...(req.pageCheckpoint ? { pageCheckpoint: req.pageCheckpoint } : {}),
      }),
      signal: req.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    return { ok: false, status: 0, transportError: true };
  }
  let data: Record<string, unknown> | null = null;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    data = null;
  }
  if (!res.ok || !data || data.ok !== true) {
    return {
      ok: false,
      status: res.status,
      transportError: false,
      kind: typeof data?.kind === "string" ? (data.kind as string) : undefined,
      error: typeof data?.error === "string" ? (data.error as string) : undefined,
      raw: data ?? undefined,
    };
  }
  return {
    ok: true,
    status: res.status,
    transportError: false,
    answer: typeof data.answer === "string" ? (data.answer as string) : "",
    refusal: data.refusal === true,
    responseClass:
      data.responseClass === "DENIAL" || data.responseClass === "PREMISE_REJECTED"
        ? (data.responseClass as AskFydResponseClass)
        : "ANSWER",
    citations: Array.isArray(data.citations) ? (data.citations as AskFydCitation[]) : [],
    unknowns: Array.isArray(data.unknowns) ? (data.unknowns as string[]) : [],
    kind: typeof data.kind === "string" ? (data.kind as string) : undefined,
    answerCheckpoint:
      typeof data.answerCheckpoint === "string" ? (data.answerCheckpoint as string) : undefined,
    tenantId: typeof data.tenantId === "string" ? (data.tenantId as string) : undefined,
    raw: data,
  };
}
