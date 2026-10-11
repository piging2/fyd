/**
 * Isolated-path config for the quote-journey test plane.
 *
 * TEST PLANE ONLY. This module wires the inquiry intake to storage that is
 * provably separate from the public demo and the production journal:
 *   - private inquiry store: var/fyd-quote-journey/private (tenant-scoped)
 *   - owner-events journal:  var/fyd-quote-journey/journal (via per-call
 *     FYD_OWNER_DIR scoping; never a global env change)
 *   - caller-key registry:   /home/nolan/.fyd-quote-journey/registry.json
 *     (outside the repo; keys never in git)
 *
 * Do NOT connect this to the public demo or the production journal until
 * the owner-auth and journal-tenant-binding patches land (CEO 2026-10-11).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CallerRegistry } from "@/app/api/mc/_lib/mc-dispatch-identity";

/** The isolated test tenant. Matches TENANT_ID_PATTERN; exists nowhere else. */
export const ISOLATED_TENANT = "quote-journey-test";

/**
 * The only site ids this test-plane route admits inquiries for. Override
 * with FYD_QUOTE_JOURNEY_SITES (comma-separated). Anything else -> 403
 * site_not_enabled before any intake work.
 */
export function isolatedSiteAllowlist(): string[] {
  const raw = process.env.FYD_QUOTE_JOURNEY_SITES;
  if (raw) return raw.split(",").map((s) => s.trim()).filter(Boolean);
  return [ISOLATED_TENANT];
}

/** Tenant-private inquiry store base (passed as privateDir to the intake). */
export function isolatedPrivateDir(): string {
  const override = process.env.FYD_QUOTE_JOURNEY_PRIVATE_DIR;
  if (override) return override;
  return join(process.cwd(), "var", "fyd-quote-journey", "private");
}

/** Isolated owner-events journal base (scoped per call, never global). */
export function isolatedJournalDir(): string {
  const override = process.env.FYD_QUOTE_JOURNEY_JOURNAL_DIR;
  if (override) return override;
  return join(process.cwd(), "var", "fyd-quote-journey", "journal");
}

const ISOLATED_REGISTRY_PATH = "/home/nolan/.fyd-quote-journey/registry.json";

/**
 * Fail-closed registry loader for the isolated path: any read/parse
 * problem -> empty registry -> every caller-key route denies. Keys live
 * OUTSIDE the repo, never in git.
 */
export function loadIsolatedRegistry(): CallerRegistry {
  const path = process.env.FYD_TEST_REGISTRY ?? ISOLATED_REGISTRY_PATH;
  const empty: CallerRegistry = { agents: {}, tenants: new Set<string>() };
  try {
    const doc = JSON.parse(readFileSync(path, "utf8")) as {
      agents?: Record<string, {
        agent_id: string;
        tenant: string;
        entitled_tenants?: string[];
        capabilities?: string[];
      }>;
    };
    const agents: CallerRegistry["agents"] = {};
    const tenants = new Set<string>();
    for (const [key, c] of Object.entries(doc.agents ?? {})) {
      if (!c || typeof c.agent_id !== "string" || typeof c.tenant !== "string") continue;
      agents[key] = {
        agent_id: c.agent_id,
        tenant: c.tenant,
        entitled_tenants: Array.isArray(c.entitled_tenants) ? c.entitled_tenants : [],
        capabilities: Array.isArray(c.capabilities) ? c.capabilities : [],
      };
      tenants.add(c.tenant);
      for (const t of agents[key].entitled_tenants) tenants.add(t);
    }
    return { agents, tenants };
  } catch {
    return empty;
  }
}

/**
 * Run fn with the owner-events journal (FYD_OWNER_DIR) pointed at the
 * isolated dir. intakeInquiry is fully synchronous, so set/restore
 * around the call is atomic with respect to other in-flight requests:
 * no other request handler can interleave inside a synchronous call.
 * Never set FYD_OWNER_DIR globally: that would redirect the whole
 * process's journal, including production paths.
 */
export function withIsolatedJournal<T>(fn: () => T): T {
  const key = "FYD_OWNER_DIR";
  const prev = process.env[key];
  process.env[key] = isolatedJournalDir();
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
}
