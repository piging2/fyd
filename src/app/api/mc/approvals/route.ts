/**
 * P0 W4: /api/mc/approvals — the harvested ApprovalRequest primitive
 * (dormant branch mc/approval-request, canonical model) exposed over HTTP
 * as the Mission Control surface.
 *
 * GET  /api/mc/approvals?proposal_id=<id>
 *      The recorded proposal: digest, status, summary, canonical bytes.
 *      Read-only; this is the proposal view for the owner decision.
 * POST /api/mc/approvals
 *      {proposal_id, digest, decision: "approve"|"deny",
 *       approver?, reason?}
 *      GATED (99h convergence block 0-10; P0 approval boundary 2026-09-30):
 *      the full boundary invariant is enforced before any decision:
 *        NO VALID PRINCIPAL       -> NO APPROVAL (401 identity_required:
 *                                     provisioned x-mc-caller-key required;
 *                                     the approver is DERIVED from the
 *                                     authenticated caller identity, never
 *                                     from the body; a differing body
 *                                     approver is refused 400
 *                                     approver_mismatch)
 *        NO REQUIRED CAPABILITY   -> NO APPROVAL (403 capability_denied:
 *                                     the caller must hold the proposal
 *                                     record's recorded capability in its
 *                                     operator-provisioned registry grants)
 *        NO EXACT PROPOSAL DIGEST -> NO APPROVAL (400 bad_digest on shape;
 *                                     the canonical transition refuses a
 *                                     digest mismatch with no state change)
 *        NO TENANT/OWNER MATCH    -> NO APPROVAL (403 tenant_not_entitled:
 *                                     the caller must be entitled to its
 *                                     derived tenant)
 *      Runs the single canonical transition in approval_request.py through
 *      approval_cli.py. The digest must match the recorded proposal digest
 *      EXACTLY; a mismatch is refused with no state change (tamper
 *      detection). Approve emits MC_APPROVAL_APPROVED; deny emits
 *      MC_APPROVAL_DENIED. Events carry the digest and metadata, never the
 *      raw proposal body.
 *
 * This route owns no approval logic: it projects the operator's decision
 * into the one canonical transition. Silence never approves.
 */

import { spawnSync } from 'child_process';
import {
  gateApprovalCaller,
  gateApprovalTenant,
  gateApprovalCapability,
  resolveApprover,
} from '../_lib/mc-approval-gate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MC_APPROVAL_DIR = '/home/nolan/projects/ping/mc-approval';
const STORE_PATH = '/home/nolan/projects/ping/var/mc-approvals.json';
const JOURNAL_PATH = '/home/nolan/workspace/fyd-journal-gateway/events.jsonl';
const OUTREACH_PATH = '/home/nolan/workspace/outreach';
const DIGEST_RE = /^[0-9a-f]{64}$/;

function bad(status: number, error: string, detail?: string) {
  return Response.json({ ok: false, error, detail: detail ?? null }, { status });
}

function runCli(args: string[]): { ok: boolean; result?: any; error?: string } {
  let r;
  try {
    r = spawnSync('python3', ['approval_cli.py', ...args], {
      cwd: MC_APPROVAL_DIR,
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, MC_OUTREACH_PATH: OUTREACH_PATH },
    });
  } catch (e) {
    return { ok: false, error: `approval_cli spawn failed: ${String(e).slice(0, 200)}` };
  }
  if (r.error) {
    return { ok: false, error: `approval_cli spawn failed: ${String(r.error).slice(0, 200)}` };
  }
  if (r.status !== 0) {
    return { ok: false, error: `approval_cli exited ${r.status}: ${(r.stderr || '').slice(0, 300)}` };
  }
  try {
    return { ok: true, result: JSON.parse((r.stdout || '').trim()) };
  } catch {
    return { ok: false, error: `approval_cli returned unparsable output: ${(r.stdout || '').slice(0, 200)}` };
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const proposalId = searchParams.get('proposal_id') || '';
  if (!proposalId) {
    return bad(400, 'bad_proposal_id', 'proposal_id query param is required.');
  }
  const cli = runCli(['get', '--store', STORE_PATH, '--proposal-id', proposalId]);
  if (!cli.ok) return bad(500, 'approval_backend_failed', cli.error);
  const res = cli.result;
  if (!res.ok) {
    return bad(404, 'unknown_proposal', `no approval record for '${proposalId}'`);
  }
  return Response.json({ ok: true, proposal: res.record });
}

export async function POST(req: Request) {
  // Approval gate first: authenticated caller before any body trust.
  const gate = gateApprovalCaller(req);
  if (!gate.ok) return gate.response;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad(400, 'bad_json', 'Request body must be JSON.');
  }
  // Approver is derived from the authenticated identity, never asserted.
  const approverRes = resolveApprover(gate.caller, body);
  if (!approverRes.ok) return approverRes.response;
  const approver = approverRes.approver;

  const proposalId = typeof body.proposal_id === 'string' ? body.proposal_id : '';
  const digest = typeof body.digest === 'string' ? body.digest : '';
  const decision = typeof body.decision === 'string' ? body.decision : '';
  const reason = typeof body.reason === 'string' ? body.reason : '';
  if (!proposalId) {
    return bad(400, 'bad_proposal_id', 'proposal_id is required.');
  }
  if (!DIGEST_RE.test(digest)) {
    return bad(400, 'bad_digest', 'digest must be a 64-char lowercase hex sha256.');
  }
  if (decision !== 'approve' && decision !== 'deny') {
    return bad(400, 'bad_decision', 'decision must be "approve" or "deny".');
  }

  // P0 boundary: tenant entitlement + required capability, before the
  // canonical transition. The record (and its recorded capability) is read
  // from the canonical store, never from the request body.
  const recCli = runCli(['get', '--store', STORE_PATH, '--proposal-id', proposalId]);
  if (!recCli.ok) return bad(500, 'approval_backend_failed', recCli.error);
  if (!recCli.result || recCli.result.ok !== true) {
    return bad(404, 'unknown_proposal', `no approval record for '${proposalId}'`);
  }
  const tenantGate = gateApprovalTenant(gate.caller);
  if (!tenantGate.ok) return tenantGate.response;
  const capGate = gateApprovalCapability(gate.caller, recCli.result.record?.capability);
  if (!capGate.ok) return capGate.response;

  const args = [
    'decide',
    '--store', STORE_PATH,
    '--journal', JOURNAL_PATH,
    '--proposal-id', proposalId,
    '--digest', digest,
    '--decision', decision,
    '--approver', approver,
  ];
  if (decision === 'deny' && reason) args.push('--reason', reason);
  const cli = runCli(args);
  if (!cli.ok) return bad(500, 'approval_backend_failed', cli.error);
  const res = cli.result;
  if (res.ok) {
    return Response.json({
      ok: true,
      decision,
      proposal_id: proposalId,
      digest,
      idempotent: res.idempotent === true,
      how: res.how ?? null,
      record: res.record,
      event: res.event ?? null,
    });
  }
  // Typed refusals from the primitive: no state change happened.
  const status = res.reason === 'unknown_id' ? 404 : 409;
  return Response.json({ ok: false, ...res }, { status });
}
