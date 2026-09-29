/**
 * Mission J (Q-P0-06 finding #1, 2026-09-27): trusted caller identity for the
 * MC dispatch POST (src/app/api/mc/dispatch/route.ts).
 *
 * The dispatch tenant is DERIVED from a server-side, operator-provisioned
 * caller registry, never from the request body. The caller presents a
 * provisioned key in the x-mc-caller-key header; this module maps it to the
 * trusted caller context { agent_id, tenant, entitled_tenants }.
 *
 * Reference semantics: the Python front door's AuthenticatedContext +
 * resolve_tenant + check_agent_entitlement (mission_intent.py): trusted A +
 * body B -> DENY; missing trusted identity -> refuse; explicit trusted
 * cross-tenant entitlement -> ALLOW. Nothing more.
 *
 * The registry is read per request so key rotation needs no rebuild; any
 * read or parse failure throws and the route refuses the dispatch (fail
 * closed). No new event types, no new authorities, no journal changes.
 */

import { readFileSync } from 'fs';

export const CALLER_KEY_HEADER = 'x-mc-caller-key';

// Operator-provisioned registry. Lives outside the repo (no secrets in git).
export const CALLER_REGISTRY_PATH =
  '/home/nolan/workspace/mission-control/dispatch-identities.json';

export interface CallerContext {
  agent_id: string;
  tenant: string;
  entitled_tenants: string[];
}

export interface CallerRegistry {
  agents: Record<string, CallerContext>;
  /** Union of every provisioned tenant and entitlement: the only body-tenant
   *  values that are not immediate 400 bad_tenant. */
  tenants: Set<string>;
}

export function loadCallerRegistry(): CallerRegistry {
  const raw = readFileSync(CALLER_REGISTRY_PATH, 'utf8');
  const doc = JSON.parse(raw) as { agents?: Record<string, CallerContext> };
  const agents = doc && typeof doc.agents === 'object' ? doc.agents : null;
  if (!agents) throw new Error('registry has no agents map');
  const tenants = new Set<string>();
  for (const key of Object.keys(agents)) {
    const c = agents[key];
    if (!c || typeof c.tenant !== 'string' || !c.tenant) {
      throw new Error('registry entry has no tenant');
    }
    if (!Array.isArray(c.entitled_tenants)) {
      throw new Error('registry entry has no entitled_tenants');
    }
    tenants.add(c.tenant);
    for (const t of c.entitled_tenants) tenants.add(t);
  }
  return { agents, tenants };
}

/**
 * Resolve the trusted caller context for a dispatch request. Returns null
 * when the key is missing or unknown: the route refuses (never falls back
 * to a body tenant).
 */
export function resolveCaller(
  req: Request,
  registry: CallerRegistry,
): CallerContext | null {
  const key = req.headers.get(CALLER_KEY_HEADER);
  return (key && registry.agents[key]) || null;
}
