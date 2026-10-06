/**
 * Ask FYD bounded context builder: ONE builder, not prompts scattered
 * through React.
 *
 * Takes the object graph plus the SiteSpec summary plus evidence plus
 * capabilities plus the request and produces the deterministic agent
 * context. Pure function: same inputs always produce the same context.
 *
 * Agent boundary law (enforced here, not in prompts):
 * - Agent suggestions NEVER authorize publishing, messages, purchases,
 *   advertising, provider actions, or business-data mutations.
 * - The agent sees only agentGrants, the forbidden effects stripped.
 * - The context binds the exact SiteSpec digest the agent reasoned over.
 *
 * FYD-010 privacy boundary law (enforced here, not in callers):
 * - Canonical objects are NEVER model input directly. buildAskFydContext
 *   projects every input object through projectAskContextForViewer before
 *   buildAskContext sees them, for every viewer class including verified
 *   owners. A caller that forgets to sanitize cannot leak: the projection
 *   is structural, not a caller convention.
 * - The viewer classifies fail-closed: only a verified identity is
 *   "owner"; anonymous, unknown, demo, and unverified viewers are
 *   "visitor". Mode strings and demo constructs can never elevate.
 * - Owner visibility decisions are honored at this boundary: a HIDE drops
 *   the field from the model context even when the field name is
 *   otherwise visitor-safe.
 */

import { buildAskContext } from "../../lib/ping/ask-composer";
import { agentGrants, assertAgentEffectAllowed, FORBIDDEN_AGENT_EFFECTS } from "./capabilities";
import { projectAskContextForViewer } from "./context-projection";
import type { AskFydContext, AskFydContextInput } from "./types";

export function buildAskFydContext(input: AskFydContextInput): AskFydContext {
  const inputTarget = input.target;
  const { viewerClass, graph } = projectAskContextForViewer(
    {
      objects:
        inputTarget !== null
          ? [inputTarget, ...input.relatedObjects]
          : [...input.relatedObjects],
      relationships: input.relationships,
    },
    input.viewer,
    input.fieldVisibilityDecisions ?? [],
    input.fieldConflicts ?? [],
  );
  // The target may not survive projection (non-public, hidden fields
  // only): fail closed to a null target rather than serving it raw.
  const target =
    inputTarget !== null
      ? graph.objects.find((o) => o.id === inputTarget.id) ?? null
      : null;
  const relatedObjects =
    target !== null
      ? graph.objects.filter((o) => o.id !== target.id)
      : [...graph.objects];
  const base = buildAskContext({
    viewer: { id: input.viewer.id, displayName: input.viewer.displayName },
    target,
    relatedObjects,
    relationships: graph.relationships,
    plan: input.plan,
  });
  const grants = [...new Set(input.grants)];
  const agentGrantList = agentGrants(grants);
  for (const grant of agentGrantList) assertAgentEffectAllowed(grant);
  return {
    base,
    siteSpec: input.siteSpec,
    siteSpecDigest: input.siteSpec ? input.siteSpec.digest : null,
    grants,
    agentGrantList,
    capabilitiesLine: agentGrantList.join(","),
    forbiddenEffects: FORBIDDEN_AGENT_EFFECTS,
    request: { question: input.question },
    fieldConflicts: input.fieldConflicts ?? [],
    viewerClass,
  };
}
