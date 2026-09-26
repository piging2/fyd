/**
 * Lane D: Mission Control dispatch control.
 *
 * GET  /api/mc/dispatch          -> dispatch catalog (agents, capabilities,
 *                                    tenants, constraints, deadlines). Every
 *                                    agent/capability comes from the EXISTING
 *                                    ExternalAgentAdapter via the lane-d shim;
 *                                    this route never invents one.
 * POST /api/mc/dispatch          -> witnessed dispatch: validate (fail-closed)
 *                                    -> adapter authorize -> adapter issue
 *                                    -> MC_* lifecycle events into the EXISTING
 *                                    journal -> execute via the agent's proven
 *                                    transport -> adapter verify -> terminal
 *                                    event. UNKNOWN is first-class: deadline
 *                                    expiry and unverifiable results NEVER
 *                                    render as FAILED.
 *
 * No new store, no new authority, no new scheduler. The journal is the
 * state; GET /api/mc/missions re-projects it on every request.
 */

import { spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  ADAPTER_SHIM,
  AgentProfile,
  BROKER_DISPATCH,
  BROKER_STATE,
  DEADLINES,
  FIXED_CONSTRAINTS,
  NAMESPACE_RE,
  OLLAMA_MODEL,
  OLLAMA_URL,
  PROMPT_MAX,
  SLICE_AGENTS,
  SLICE_TENANTS,
  SliceAgent,
  adapterCall,
  appendDispatchEvent,
  loadProfiles,
  mintEventId,
  nowIso,
  publishArtifact,
  sha256hex,
} from '../_lib/mc-dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DispatchBody {
  prompt?: unknown;
  agent?: unknown;
  capability?: unknown;
  tenant?: unknown;
}

function bad(status: number, error: string, detail?: string) {
  return Response.json({ ok: false, error, detail: detail ?? null }, { status });
}

/** Catalog of what this control may dispatch. Agent truth comes from the adapter. */
export async function GET() {
  let profiles: Record<string, AgentProfile>;
  try {
    profiles = loadProfiles();
  } catch (e) {
    return bad(503, 'adapter_unavailable', String(e).slice(0, 300));
  }
  const agents = (SLICE_AGENTS as readonly string[])
    .filter((id) => profiles[id] && profiles[id].status === 'LIVE')
    .map((id) => ({
      id,
      family: profiles[id].family,
      status: profiles[id].status,
      allowedCapabilities: profiles[id].allowedCapabilities,
      // Broker transports spend real quota; implemented but not acceptance-proven.
      claim: id === 'ollama' ? 'PROVEN' : 'PROTOTYPE',
      claim_note:
        id === 'ollama'
          ? 'Acceptance-proven in this lane (local, zero spend).'
          : 'Transport implemented against the proven broker caller; not acceptance-run in this lane (no quota spent).',
    }));
  return Response.json({
    ok: true,
    as_of: nowIso(),
    agents,
    tenants: [...SLICE_TENANTS],
    constraints: FIXED_CONSTRAINTS,
    prompt_max: PROMPT_MAX,
    deadlines_seconds: DEADLINES,
    adapter_shim: ADAPTER_SHIM,
  });
}

function checkBrokerQuota(identityId: string): { eligible: boolean; reason: string } {
  try {
    if (!existsSync(BROKER_STATE)) return { eligible: false, reason: 'broker state file absent' };
    const state = JSON.parse(readFileSync(BROKER_STATE, 'utf8'));
    const row = state?.[identityId];
    if (!row) return { eligible: false, reason: `no broker row for ${identityId}` };
    if (row.status !== 'ACTIVE' && row.status !== 'DEGRADED') {
      return { eligible: false, reason: `identity status ${row.status}` };
    }
    if (row.quota_state !== 'OK') {
      return { eligible: false, reason: `quota_state ${row.quota_state} (fail-closed)` };
    }
    if (typeof row.quota_remaining !== 'number' || row.quota_remaining < 1) {
      return { eligible: false, reason: 'no quota remaining' };
    }
    return { eligible: true, reason: `quota_remaining=${row.quota_remaining}` };
  } catch (e) {
    return { eligible: false, reason: `quota check failed: ${String(e).slice(0, 200)}` };
  }
}

interface AgentOutcome {
  // 'ran' = the agent received the prompt and returned something (verifiable or not).
  // 'transport-failed' = the prompt was never delivered (honest FAILED).
  // 'timeout' = delivered or maybe-delivered, no result by deadline (UNKNOWN).
  kind: 'ran' | 'transport-failed' | 'timeout';
  output?: string;
  error?: string;
  evidence?: Record<string, unknown>;
}

async function runOllama(prompt: string, deadlineS: number): Promise<AgentOutcome> {
  const startedAt = nowIso();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deadlineS * 1000);
  try {
    const res = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt, stream: false, options: { num_predict: 400 } }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const endedAt = nowIso();
    if (!res.ok) {
      return { kind: 'transport-failed', error: `ollama http ${res.status}`, evidence: { startedAt, endedAt, host: 'pig-wsl', model: OLLAMA_MODEL } };
    }
    const body = (await res.json()) as { response?: string; error?: string };
    if (typeof body.response !== 'string') {
      return { kind: 'transport-failed', error: `ollama malformed response: ${(body.error || 'no response field').slice(0, 200)}`, evidence: { startedAt, endedAt, host: 'pig-wsl', model: OLLAMA_MODEL } };
    }
    return {
      kind: 'ran',
      output: body.response.slice(0, 8000),
      evidence: { startedAt, endedAt, host: 'pig-wsl', model: OLLAMA_MODEL, capabilityPerformed: true },
    };
  } catch (e) {
    clearTimeout(timer);
    const endedAt = nowIso();
    const msg = String(e);
    if (msg.includes('abort') || (e as Error)?.name === 'AbortError') {
      return { kind: 'timeout', error: `no result by deadline (${deadlineS}s)`, evidence: { startedAt, endedAt, host: 'pig-wsl', model: OLLAMA_MODEL } };
    }
    return { kind: 'transport-failed', error: `ollama unreachable: ${msg.slice(0, 200)}`, evidence: { startedAt, endedAt, host: 'pig-wsl', model: OLLAMA_MODEL } };
  }
}

function runBroker(identityId: string, prompt: string, deadlineS: number): AgentOutcome {
  const startedAt = nowIso();
  const quota = checkBrokerQuota(identityId);
  if (!quota.eligible) {
    // Dispatcher-side block: the agent never ran. Outcome UNKNOWN, not FAILED.
    return { kind: 'timeout', error: `broker dispatch blocked (${quota.reason})`, evidence: { startedAt, endedAt: nowIso(), host: 'pig-wsl', identityUsed: identityId, quotaCheck: quota.reason } };
  }
  const taskFile = join(tmpdir(), `mc-broker-task-${sha256hex(identityId + startedAt).slice(0, 12)}.json`);
  writeFileSync(taskFile, JSON.stringify({ identity_id: identityId, prompt, workdir: tmpdir() }), 'utf8');
  const r = spawnSync('node', [BROKER_DISPATCH, taskFile], {
    encoding: 'utf8',
    timeout: deadlineS * 1000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const endedAt = nowIso();
  if (r.error) {
    const msg = String(r.error);
    if (msg.includes('ETIMEDOUT') || msg.includes('timed out')) {
      return { kind: 'timeout', error: `broker dispatch timed out after ${deadlineS}s`, evidence: { startedAt, endedAt, host: 'pig-wsl', identityUsed: identityId } };
    }
    return { kind: 'transport-failed', error: `broker spawn failed: ${msg.slice(0, 200)}`, evidence: { startedAt, endedAt, host: 'pig-wsl', identityUsed: identityId } };
  }
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(r.stdout) as Record<string, unknown>;
  } catch {
    return { kind: 'transport-failed', error: 'broker returned unparsable output', evidence: { startedAt, endedAt, host: 'pig-wsl', identityUsed: identityId } };
  }
  if (parsed.timed_out) {
    return { kind: 'timeout', error: 'broker reports agent timed out', evidence: { startedAt, endedAt, host: 'pig-wsl', identityUsed: identityId, classification: parsed.classification } };
  }
  if (parsed.route === 'blocked') {
    return { kind: 'timeout', error: `broker blocked: ${String(parsed.reason || 'unknown')}`, evidence: { startedAt, endedAt, host: 'pig-wsl', identityUsed: identityId } };
  }
  const text = typeof parsed.result_text === 'string' ? parsed.result_text : null;
  if (text && text.length > 0) {
    return {
      kind: 'ran',
      output: text.slice(0, 8000),
      evidence: {
        startedAt, endedAt, host: 'pig-wsl', identityUsed: identityId,
        model: parsed.model ?? null, classification: parsed.classification ?? null,
        actual_reported_usage: parsed.actual_reported_usage ?? null, capabilityPerformed: true,
      },
    };
  }
  return { kind: 'ran', error: `broker completed without result_text (classification=${String(parsed.classification || 'n/a')})`, evidence: { startedAt, endedAt, host: 'pig-wsl', identityUsed: identityId } };
}

export async function POST(req: Request) {
  let body: DispatchBody;
  try {
    body = (await req.json()) as DispatchBody;
  } catch {
    return bad(400, 'bad_json', 'Request body must be JSON.');
  }

  // ---- Fail-closed input validation (before any event or side effect) ----
  const prompt = typeof body.prompt === 'string' ? body.prompt : '';
  const agent = typeof body.agent === 'string' ? body.agent : '';
  const capability = typeof body.capability === 'string' ? body.capability : '';
  const tenant = typeof body.tenant === 'string' ? body.tenant : '';

  if (!prompt || prompt.length > PROMPT_MAX) {
    return bad(400, 'bad_prompt', `prompt must be 1..${PROMPT_MAX} chars.`);
  }
  if (!(SLICE_AGENTS as readonly string[]).includes(agent)) {
    return bad(403, 'agent_denied', `agent '${agent || '(missing)'}' is not dispatchable from Mission Control.`);
  }
  if (!(SLICE_TENANTS as readonly string[]).includes(tenant)) {
    return bad(400, 'bad_tenant', `tenant must be one of: ${SLICE_TENANTS.join(', ')}.`);
  }
  if (!capability) return bad(400, 'bad_capability', 'capability is required.');

  let profiles: Record<string, AgentProfile>;
  try {
    profiles = loadProfiles();
  } catch (e) {
    return bad(503, 'adapter_unavailable', String(e).slice(0, 300));
  }
  const profile = profiles[agent];
  if (!profile || profile.status !== 'LIVE') {
    return bad(403, 'agent_denied', `agent '${agent}' is not LIVE in the adapter registry.`);
  }
  if (!profile.allowedCapabilities.includes(capability)) {
    return bad(403, 'capability_denied', `capability '${capability}' not allowed for agent '${agent}'.`);
  }

  // ---- Identity set (deterministic ids) ----
  const ts = nowIso();
  const promptDigest = sha256hex(prompt);
  const missionId = 'mc-m-' + sha256hex(['mission', agent, tenant, capability, promptDigest, ts].join('|')).slice(0, 12);
  const runId = `${missionId}-r1`;
  const executionId = `${missionId}-x1`;
  const taskId = `${missionId}:task:1`;
  const correlationId = missionId;
  const contextPackId = `mc-ctx-${missionId}`;
  const namespace = `tenant::${tenant}`;
  if (!NAMESPACE_RE.test(namespace)) return bad(400, 'bad_namespace', namespace);
  const deadlineS = DEADLINES[agent as SliceAgent];
  const deadline = new Date(Date.now() + deadlineS * 1000).toISOString();
  const resultPath = `/home/nolan/workspace/mission-control/artifacts/${missionId}/result.json`;

  const emit = (type: string, summary: string, data: Record<string, unknown> = {}) =>
    appendDispatchEvent(type, missionId, summary, {
      run_id: runId, execution_id: executionId, agent, tenant, capability,
      context_pack_id: contextPackId, ...data,
    });

  // ---- Adapter: authorize (the adapter owns this decision) ----
  let authz: { ok: boolean; granted?: boolean; reason?: string | null };
  try {
    authz = adapterCall('authorize', {
      agentId: agent, capability, namespace, constraints: FIXED_CONSTRAINTS,
    }) as typeof authz;
  } catch (e) {
    return bad(503, 'adapter_error', String(e).slice(0, 300));
  }
  if (!authz || authz.ok !== true || authz.granted !== true) {
    emit('MC_MISSION_CREATED', `mission created (dispatch denied): ${missionId}`, { prompt_digest: promptDigest });
    const reason = (authz && authz.reason) || 'adapter denied';
    emit('MC_AGENT_DENIED', `dispatch denied for agent ${agent}: ${reason}`, { reason });
    return Response.json({ ok: false, status: 'DENIED', mission_id: missionId, reason }, { status: 403 });
  }

  // ---- Adapter: issue work order (builds the envelope; never sends) ----
  let workOrder: Record<string, unknown>;
  try {
    const issued = adapterCall('issue', {
      agentId: agent, capability, namespace, taskId, missionId, correlationId,
      contextPackId, input: { prompt, prompt_digest: promptDigest, note: 'bounded dispatch prompt; full text in prompt.txt artifact' },
      constraints: FIXED_CONSTRAINTS, resultPath, deadline, causationId: null, attempt: 1,
    }) as { ok: boolean; workOrder?: Record<string, unknown>; error?: string; detail?: string };
    if (!issued || issued.ok !== true || !issued.workOrder) {
      throw new Error(`issue_failed: ${issued?.error || 'unknown'} ${issued?.detail || ''}`);
    }
    workOrder = issued.workOrder;
  } catch (e) {
    emit('MC_MISSION_CREATED', `mission created (work order issue failed): ${missionId}`, { prompt_digest: promptDigest });
    emit('MC_RUN_UNKNOWN', `work order issue failed: ${String(e).slice(0, 200)}`, {
      reason: String(e).slice(0, 300), reconciliation_state: 'RECONCILIATION IN PROGRESS',
    });
    return bad(503, 'workorder_issue_failed', String(e).slice(0, 300));
  }
  const workOrderId = workOrder.work_order_id as string;

  // ---- Lifecycle events: mission -> run -> execution (the witnessed dispatch) ----
  emit('MC_MISSION_CREATED', `mission created: ${missionId}`, { prompt_digest: promptDigest });
  emit('MC_RUN_QUEUED', `run queued: ${runId}`, {});
  emit('MC_EXECUTION_STARTED', `execution started: ${executionId}`, {});
  emit('MC_AGENT_AUTHORIZED', `agent ${agent} authorized for ${capability}`, {
    capabilities_granted: [capability], work_order_id: workOrderId,
  });

  // ---- Artifacts: prompt, work order, context (evidence the agent receives) ----
  publishArtifact(missionId, 'prompt', 'prompt.txt', prompt);
  publishArtifact(missionId, 'work-order', 'workorder.json', JSON.stringify(workOrder, null, 2));
  publishArtifact(missionId, 'context', 'context.json', JSON.stringify({
    context_pack_id: contextPackId, mission_id: missionId, run_id: runId,
    execution_id: executionId, agent, tenant, capability, namespace,
    constraints: FIXED_CONSTRAINTS, deadline, deadline_seconds: deadlineS,
    prompt_digest: promptDigest, principal: 'mission-control-dispatch',
  }, null, 2));

  // ---- Execute via the agent's proven transport ----
  let outcome: AgentOutcome;
  if (agent === 'ollama') {
    outcome = await runOllama(prompt, deadlineS);
  } else {
    outcome = runBroker(agent, prompt, deadlineS);
  }

  // ---- Terminal event. UNKNOWN is first-class; never collapsed. ----
  if (outcome.kind === 'transport-failed') {
    // The prompt was never delivered: honest execution failure.
    emit('MC_RUN_FAILED', `execution failed: ${outcome.error}`, {
      error: outcome.error, evidence: outcome.evidence ?? null,
    });
    return Response.json({
      ok: true, status: 'FAILED', mission_id: missionId, run_id: runId,
      execution_id: executionId, work_order_id: workOrderId, error: outcome.error,
    });
  }

  if (outcome.kind === 'timeout') {
    // Delivered-or-maybe-delivered, no verifiable result: OUTCOME UNKNOWN.
    emit('MC_RUN_UNKNOWN', `outcome unknown: ${outcome.error}`, {
      reason: outcome.error, reconciliation_state: 'RECONCILIATION IN PROGRESS',
      evidence: outcome.evidence ?? null,
    });
    return Response.json({
      ok: true, status: 'UNKNOWN', mission_id: missionId, run_id: runId,
      execution_id: executionId, work_order_id: workOrderId,
      reconciliation_state: 'RECONCILIATION IN PROGRESS', reason: outcome.error,
    });
  }

  // The agent ran: build the 8-field result envelope and let the ADAPTER verify.
  const verifiedAt = nowIso();
  const resultEnvelope = {
    work_order_id: workOrderId,
    context_pack_id: contextPackId,
    agent_id: agent,
    capability,
    status: outcome.output ? 'completed' : 'failed',
    output: outcome.output ?? null,
    evidence: outcome.evidence ?? {},
    error: outcome.output ? null : (outcome.error || 'no output'),
  };
  let verification: { ok: boolean; valid?: boolean; result_id?: string | null; error?: string | null };
  try {
    verification = adapterCall('verify', {
      result: resultEnvelope, workOrder, invokedAgentId: agent, verifiedAt,
    }) as typeof verification;
  } catch (e) {
    verification = { ok: false, error: String(e).slice(0, 300) };
  }

  if (!verification || verification.ok !== true || verification.valid !== true) {
    // Cannot trust the envelope: outcome UNKNOWN (validation failure is
    // non-retryable per the contract; it must not reach canonical truth).
    const reason = `result envelope failed adapter verification: ${(verification && verification.error) || 'invalid'}`;
    emit('MC_RUN_UNKNOWN', reason, {
      reason, reconciliation_state: 'RECONCILIATION IN PROGRESS',
      evidence: outcome.evidence ?? null,
    });
    return Response.json({
      ok: true, status: 'UNKNOWN', mission_id: missionId, run_id: runId,
      execution_id: executionId, work_order_id: workOrderId,
      reconciliation_state: 'RECONCILIATION IN PROGRESS', reason,
    });
  }

  publishArtifact(missionId, 'result', 'result.json', JSON.stringify({
    ...resultEnvelope, verified_at: verifiedAt, result_id: verification.result_id,
    mission_id: missionId, run_id: runId, execution_id: executionId,
  }, null, 2));

  if (resultEnvelope.status === 'completed') {
    const outputDigest = sha256hex(outcome.output || '');
    emit('MC_RUN_SUCCEEDED', `run succeeded: ${runId}`, {
      result_id: verification.result_id, output_digest: outputDigest,
      output_chars: (outcome.output || '').length,
      evidence: outcome.evidence ?? null,
    });
    return Response.json({
      ok: true, status: 'SUCCEEDED', mission_id: missionId, run_id: runId,
      execution_id: executionId, work_order_id: workOrderId,
      result_id: verification.result_id, output_digest: outputDigest,
    });
  }

  emit('MC_RUN_FAILED', `agent reported failure: ${outcome.error}`, {
    error: outcome.error, result_id: verification.result_id, evidence: outcome.evidence ?? null,
  });
  return Response.json({
    ok: true, status: 'FAILED', mission_id: missionId, run_id: runId,
    execution_id: executionId, work_order_id: workOrderId, error: outcome.error,
  });
}
