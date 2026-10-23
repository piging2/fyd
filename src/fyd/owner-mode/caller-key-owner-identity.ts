/**
 * P1 (2026-10-11): caller-key-backed owner identity for the demo plane.
 *
 * Implements the EXISTING OwnerIdentityProvider seam (./owner-identity.ts)
 * using the EXISTING P8 caller-key registry machinery
 * (../../app/api/mc/_lib/mc-dispatch-identity.ts). No new authority is
 * created:
 *
 * - Verification = the presented caller key resolves in the
 *   operator-provisioned registry (loadCallerRegistry). The registry is
 *   read per resolution so key rotation needs no restart; any read or
 *   parse failure resolves to null (fail closed).
 * - The identity is verified (verified: true) ONLY on a registry hit.
 *   Missing key, unknown key, or unreadable registry -> null. There is
 *   no fallback to the demo provider and no anonymous owner.
 * - Entitlement = the caller's credential-derived tenant set
 *   (readableTenants from ../../app/api/mc/_lib/mc-read-identity.ts):
 *   the caller's own tenant plus explicit entitled_tenants. Callers of
 *   the intake consult it; this module only exposes it.
 *
 * Server-side only (reads the registry file through the P8 loader).
 */

import {
  loadCallerRegistry,
  type CallerContext,
  type CallerRegistry,
} from "../../app/api/mc/_lib/mc-dispatch-identity";
import { readableTenants } from "../../app/api/mc/_lib/mc-read-identity";
import type {
  OwnerIdentity,
  OwnerIdentityProvider,
} from "./owner-identity";

export interface CallerKeyIdentityOptions {
  /** The presented caller key (e.g. from the x-mc-caller-key header). */
  callerKey: string | null | undefined;
  /**
   * Registry loader override. Defaults to the P8 production loader
   * (operator-provisioned file). Tests inject a fake registry: no I/O,
   * no network, no store.
   */
  loadRegistry?: () => CallerRegistry;
}

/**
 * OwnerIdentityProvider backed by the P8 caller-key registry. Bind it
 * via bindIdentityProvider() for a request scope that carries a caller
 * key; the default demo provider stays bound everywhere else.
 */
export class CallerKeyOwnerIdentityProvider implements OwnerIdentityProvider {
  readonly name = "caller-key (P8 registry)";

  private readonly callerKey: string | null;
  private readonly loadRegistry: () => CallerRegistry;

  constructor(opts: CallerKeyIdentityOptions) {
    const key = opts.callerKey ?? null;
    this.callerKey = typeof key === "string" && key.length > 0 ? key : null;
    this.loadRegistry = opts.loadRegistry ?? loadCallerRegistry;
  }

  /**
   * Resolve the registry entry for the presented key, or null. Never
   * throws: an unreadable registry or unknown key is "no identity",
   * never an exception the caller might mishandle into an allow.
   */
  resolveCaller(): CallerContext | null {
    if (this.callerKey === null) return null;
    let registry: CallerRegistry;
    try {
      registry = this.loadRegistry();
    } catch {
      return null;
    }
    return registry.agents[this.callerKey] ?? null;
  }

  /**
   * The credential-derived tenant set for the presented key, or null
   * when the key does not resolve. Reuses the P8 readable-tenants rule:
   * the caller's own tenant plus every explicit entitlement.
   */
  entitledTenants(): string[] | null {
    const caller = this.resolveCaller();
    return caller ? readableTenants(caller) : null;
  }

  async resolveIdentity(): Promise<OwnerIdentity | null> {
    const caller = this.resolveCaller();
    if (!caller) return null;
    return {
      identityId: caller.agent_id,
      verified: true,
      method: "caller-key",
      note:
        "Verified against the operator-provisioned P8 caller registry: " +
        "the presented key resolves to agent '" +
        caller.agent_id +
        "'. No password or session was checked beyond the provisioned key; " +
        "tenant entitlement is enforced separately at intake.",
    };
  }
}

/**
 * Convenience: bind a caller-key provider for the current scope and
 * return it. The caller passes the presented key; nothing is read from
 * ambient request state here (the route extracts the header).
 */
export function providerForCallerKey(
  callerKey: string | null | undefined,
  loadRegistry?: () => CallerRegistry,
): CallerKeyOwnerIdentityProvider {
  return new CallerKeyOwnerIdentityProvider({ callerKey, loadRegistry });
}
