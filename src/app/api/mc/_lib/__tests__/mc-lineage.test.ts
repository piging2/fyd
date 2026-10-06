/**
 * Tests for the MC lineage spine (mc-lineage.ts): the ONE operational
 * spine contract. Stage order is pinned; every stage carries an explicit
 * source label; no stage may claim MOCK on the real path.
 */

import { missionSpine, SPINE_ORDER, type SpineStage } from '../mc-lineage';
import type { MissionRecord } from '../mc-dispatch';

function record(over: Partial<MissionRecord> = {}): MissionRecord {
  return {
    mission_id: 'mc-m-test1',
    run_id: 'mc-m-test1-r1',
    execution_id: 'mc-m-test1-x1',
    status: 'SUCCEEDED',
    status_event_id: 'mc-d-abc',
    agent: 'ollama',
    tenant: 'ping',
    capability: 'text.transform',
    capabilities_granted: ['text.transform'],
    work_order_id: null,
    context_pack_id: 'mc-ctx-test',
    started_at: '2026-10-02T01:36:32.000Z',
    ended_at: '2026-10-02T01:36:35.000Z',
    result: { outcome: 'SUCCEEDED', output_digest: 'abc123', output_chars: 42, error: null },
    reconciliation_state: null,
    artifacts: [
      { kind: 'result', path: '/tmp/x', sha256: 'abc', present: false, event_id: 'mc-d-def' },
    ],
    evidence: [{ ref: 'ping-event:123' }],
    events: [
      { event_id: 'mc-d-1', event_type: 'MC_MISSION_CREATED', timestamp: '2026-10-02T01:36:32.000Z', summary: null },
      { event_id: 'mc-d-2', event_type: 'MC_RUN_QUEUED', timestamp: '2026-10-02T01:36:32.000Z', summary: null },
      { event_id: 'mc-d-3', event_type: 'MC_EXECUTION_STARTED', timestamp: '2026-10-02T01:36:32.000Z', summary: null },
      { event_id: 'mc-d-4', event_type: 'MC_AGENT_AUTHORIZED', timestamp: '2026-10-02T01:36:32.000Z', summary: null },
      { event_id: 'mc-d-5', event_type: 'MC_RUN_SUCCEEDED', timestamp: '2026-10-02T01:36:35.000Z', summary: null },
    ],
    ...over,
  };
}

describe('missionSpine contract', () => {
  test('stage order is pinned: MISSION -> RUN -> EXECUTION -> AGENT -> RESULT -> EVIDENCE -> EVENT', () => {
    const spine = missionSpine(record());
    expect(spine.map((s) => s.stage)).toEqual([...SPINE_ORDER]);
  });

  test('every stage has an explicit source label and note', () => {
    const spine = missionSpine(record());
    for (const s of spine) {
      expect(['LIVE', 'PROJECTED', 'DERIVED', 'MOCK', 'UNKNOWN']).toContain(s.source);
      expect(typeof s.note).toBe('string');
      expect(s.note.length).toBeGreaterThan(0);
    }
  });

  test('no MOCK source on the real path', () => {
    const spine = missionSpine(record());
    expect(spine.some((s) => s.source === 'MOCK')).toBe(false);
  });

  test('LIVE stages read journal rows: mission/run/execution/result/evidence/event', () => {
    const spine = missionSpine(record());
    const byStage = Object.fromEntries(spine.map((s) => [s.stage, s]));
    for (const name of ['MISSION', 'RUN', 'EXECUTION', 'RESULT', 'EVIDENCE', 'EVENT']) {
      expect(byStage[name].source).toBe('LIVE');
    }
  });

  test('AGENT stage is PROJECTED and states the agent-truth boundary', () => {
    const spine = missionSpine(record());
    const agent = spine.find((s) => s.stage === 'AGENT')!;
    expect(agent.source).toBe('PROJECTED');
    expect(agent.note).toMatch(/never owns truth/i);
  });

  test('denied execution is visible, not hidden', () => {
    const r = record({
      events: [
        { event_id: 'mc-d-1', event_type: 'MC_MISSION_CREATED', timestamp: '2026-10-02T01:36:32.000Z', summary: null },
        { event_id: 'mc-d-2', event_type: 'MC_AGENT_DENIED', timestamp: '2026-10-02T01:36:33.000Z', summary: null },
      ],
    });
    const spine = missionSpine(r);
    const exec = spine.find((s) => s.stage === 'EXECUTION')!;
    expect((exec.data as { authorized: boolean }).authorized).toBe(false);
  });

  test('pure: same record in -> same spine out', () => {
    const r = record();
    expect(JSON.stringify(missionSpine(r))).toBe(JSON.stringify(missionSpine(record())));
  });
});
