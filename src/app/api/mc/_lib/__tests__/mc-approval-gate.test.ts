/**
 * Unit tests for the P0 approval boundary gates (mc-approval-gate.ts).
 * Pure-function tests: no registry I/O, no network, no store.
 */
import {
  gateApprovalCapability,
  gateApprovalTenant,
  gateProposalTenant,
  resolveApprover,
} from '../mc-approval-gate';
import type { CallerContext } from '../mc-dispatch-identity';

function caller(overrides: Partial<CallerContext> = {}): CallerContext {
  return {
    agent_id: 'nolan:owner',
    tenant: 'demo-owner',
    entitled_tenants: ['demo-owner'],
    capabilities: ['fyd.sitespec.patch'],
    ...overrides,
  };
}

describe('gateApprovalCapability (NO REQUIRED CAPABILITY -> NO APPROVAL)', () => {
  test('allows a caller holding the required capability', async () => {
    const r = gateApprovalCapability(caller(), 'fyd.sitespec.patch');
    expect(r.ok).toBe(true);
  });

  test('refuses 403 when the caller lacks the capability', async () => {
    const r = gateApprovalCapability(caller({ capabilities: [] }), 'fyd.sitespec.patch');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(403);
      const body = await r.response.json();
      expect(body.error).toBe('capability_denied');
    }
  });

  test('refuses 403 when the record declares no capability (fail closed)', async () => {
    for (const missing of [undefined, '', null]) {
      const r = gateApprovalCapability(caller(), missing);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.response.status).toBe(403);
    }
  });

  test('capability match is exact (no substring grants)', async () => {
    const r = gateApprovalCapability(
      caller({ capabilities: ['fyd.sitespec'] }),
      'fyd.sitespec.patch',
    );
    expect(r.ok).toBe(false);
  });
});

describe('gateApprovalTenant (NO TENANT MATCH -> NO APPROVAL)', () => {
  test('allows a caller entitled to its derived tenant', () => {
    expect(gateApprovalTenant(caller()).ok).toBe(true);
  });

  test('refuses 403 when the caller is not entitled to its tenant', async () => {
    const r = gateApprovalTenant(
      caller({ tenant: 'other-tenant', entitled_tenants: ['demo-owner'] }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(403);
      const body = await r.response.json();
      expect(body.error).toBe('tenant_not_entitled');
    }
  });
});

describe('gateProposalTenant (P0-2: PROPOSAL TENANT vs CALLER ENTITLEMENT)', () => {
  const tenantedWaiting = { tenant: 'demo-owner', status: 'WAITING_APPROVAL' };

  test('allows an entitled caller to approve a same-tenant proposal', () => {
    expect(gateProposalTenant(caller(), tenantedWaiting, 'approve').ok).toBe(true);
  });

  test('allows a caller entitled via entitled_tenants (not derived tenant)', () => {
    const c = caller({ tenant: 'ops', entitled_tenants: ['ops', 'demo-owner'] });
    expect(gateProposalTenant(c, tenantedWaiting, 'approve').ok).toBe(true);
  });

  test('refuses 403 tenant_not_entitled on cross-tenant approve', async () => {
    const c = caller({ tenant: 'other-tenant', entitled_tenants: ['other-tenant'] });
    const r = gateProposalTenant(c, tenantedWaiting, 'approve');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(403);
      const body = await r.response.json();
      expect(body.error).toBe('tenant_not_entitled');
    }
  });

  test('refuses 403 tenant_not_entitled on cross-tenant deny', async () => {
    const c = caller({ tenant: 'other-tenant', entitled_tenants: ['other-tenant'] });
    const r = gateProposalTenant(c, tenantedWaiting, 'deny');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(403);
      const body = await r.response.json();
      expect(body.error).toBe('tenant_not_entitled');
    }
  });

  test('refuses 403 tenant_unknown on approve of tenant-less WAITING record', async () => {
    const r = gateProposalTenant(caller(), { status: 'WAITING_APPROVAL' }, 'approve');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(403);
      const body = await r.response.json();
      expect(body.error).toBe('tenant_unknown');
    }
  });

  test('allows deny of a tenant-less WAITING record (safe direction, no stranding)', () => {
    expect(gateProposalTenant(caller(), { status: 'WAITING_APPROVAL' }, 'deny').ok).toBe(true);
  });

  test('terminal legacy records keep canonical behavior (idempotent approve passes the gate)', () => {
    expect(gateProposalTenant(caller(), { status: 'APPROVED' }, 'approve').ok).toBe(true);
    expect(gateProposalTenant(caller(), { status: 'DENIED' }, 'deny').ok).toBe(true);
  });

  test('a tenant-bearing terminal record still enforces entitlement', async () => {
    const c = caller({ tenant: 'other-tenant', entitled_tenants: ['other-tenant'] });
    const r = gateProposalTenant(c, { tenant: 'demo-owner', status: 'APPROVED' }, 'approve');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });
});

describe('resolveApprover (approver derived, never asserted)', () => {
  test('absent body approver falls back to the caller identity', () => {
    const r = resolveApprover(caller(), {});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.approver).toBe('nolan:owner');
  });

  test('matching body approver is accepted', () => {
    const r = resolveApprover(caller(), { approver: 'nolan:owner' });
    expect(r.ok).toBe(true);
  });

  test('differing body approver is refused 400', async () => {
    const r = resolveApprover(caller(), { approver: 'mallory' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      const body = await r.response.json();
      expect(body.error).toBe('approver_mismatch');
    }
  });
});
