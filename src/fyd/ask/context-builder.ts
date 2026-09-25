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
 */

import { buildAskContext } from "../../lib/ping/ask-composer";
import { agentGrants, assertAgentEffectAllowed, FORBIDDEN_AGENT_EFFECTS } from "./capabilities";
import type { AskFydContext, AskFydContextInput } from "./types";

export function buildAskFydContext(input: AskFydContextInput): AskFydContext {
  const base = buildAskContext({
    viewer: input.viewer,
    target: input.target,
    relatedObjects: input.relatedObjects,
    relationships: input.relationships,
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
  };
}
