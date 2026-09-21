/**
 * CapabilityRuntime: the explicit runtime behind portal Circle capabilities.
 *
 * The directive's architecture chain ends here. Capability *detection*
 * (hasCapability over the portal projection) and capability *execution*
 * (the HTTP round-trips for follow/like/ask, and the validated website
 * open) are owned by one pure, client-safe module instead of living inline
 * in the Circle component.
 *
 * Fail-closed: every executor returns the previous state on any transport
 * or server failure, so the Circle can never display a state the server
 * did not confirm.
 */

import type { PortalProjection } from "@/fyd/preview/types";
import { isSafeWebHref } from "@/fyd/preview/types";

export type CapabilityKind = "follow" | "like" | "ask" | "website";

export function hasCapability(portal: PortalProjection, kind: CapabilityKind): boolean {
  return portal.circle.capabilities.some((c) => c.kind === kind);
}

async function postJson<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

interface FollowBody {
  ok?: boolean;
  following?: unknown;
}

interface LikeBody {
  ok?: boolean;
  liked?: unknown;
}

interface AskBody {
  ok?: boolean;
  answer?: unknown;
  refusal?: unknown;
}

/**
 * POST /api/fyd/follow. Fail-closed: returns `current` on any failure,
 * so the Circle keeps the last server-confirmed state.
 */
export async function executeFollow(objectId: string, current: boolean): Promise<boolean> {
  const d = await postJson<FollowBody>("/api/fyd/follow", {
    objectId,
    action: current ? "unfollow" : "follow",
  });
  return d && d.ok === true ? !!d.following : current;
}

/**
 * POST /api/fyd/like. Fail-closed: returns `current` on any failure.
 */
export async function executeLike(objectId: string, current: boolean): Promise<boolean> {
  const d = await postJson<LikeBody>("/api/fyd/like", {
    objectId,
    action: current ? "unlike" : "like",
  });
  return d && d.ok === true ? !!d.liked : current;
}

export interface AskResult {
  ok: boolean;
  answer?: string;
  refusal?: boolean;
}

/** POST /api/fyd/ask with mode "visitor". */
export async function submitAsk(objectId: string, question: string): Promise<AskResult> {
  const d = await postJson<AskBody>("/api/fyd/ask", {
    siteId: objectId,
    question,
    mode: "visitor",
  });
  if (!d || d.ok !== true) return { ok: false };
  return {
    ok: true,
    answer: typeof d.answer === "string" ? d.answer : "",
    refusal: !!d.refusal,
  };
}

/**
 * Validates the href (https-only) then opens it _blank noopener.
 * No-op when unsafe or when there is no window.
 */
export function openWebsite(href: string): void {
  if (typeof window === "undefined") return;
  if (!isSafeWebHref(href)) return;
  window.open(href, "_blank", "noopener,noreferrer");
}
