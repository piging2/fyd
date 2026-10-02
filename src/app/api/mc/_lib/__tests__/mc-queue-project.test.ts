/**
 * Tests for the MC queue projection (mc-queue-project.ts): the canonical
 * state mapping table and the derived health detector.
 */

import {
  canonicalState,
  missionHealth,
  projectQueueMission,
  projectQueueMissions,
  QueueMissionInput,
} from '../mc-queue-project';

function row(over: Partial<QueueMissionInput> = {}): QueueMissionInput {
  return {
    mission_id: 'm-test-1',
    mission_type: 'CLAIM_GENERATION',
    status: 'created',
    tenant_id: 'tenant-1',
    created_by: 'system',
    created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    started_at: null,
    completed_at: null,
    assigned_to: null,
    retries: 0,
    hold_at: null,
    event_count: 1,
    lifecycle_event_count: 1,
    ...over,
  };
}

describe('canonicalState mapping table', () => {
  test.each([
    ['created', 'PROPOSED'],
    ['assigned', 'EXECUTED'],
    ['running', 'EXECUTED'],
    ['retry_pending', 'EXECUTED'],
    ['completed', 'EXECUTED'],
    ['failed', 'FAILED'],
    ['archived', 'EXECUTED'],
  ])('status %s -> %s', (status, expected) => {
    expect(canonicalState(status)).toBe(expected);
  });

  test('unknown status string is UNKNOWN, never guessed', () => {
    expect(canonicalState('dispatched')).toBe('UNKNOWN');
    expect(canonicalState('in-flight')).toBe('UNKNOWN');
    expect(canonicalState('')).toBe('UNKNOWN');
  });

  test('null status is UNKNOWN', () => {
    expect(canonicalState(null)).toBe('UNKNOWN');
  });

  test('mapping is case-insensitive and whitespace-tolerant', () => {
    expect(canonicalState(' Completed ')).toBe('EXECUTED');
    expect(canonicalState('FAILED')).toBe('FAILED');
  });
});

describe('missionHealth derived detector', () => {
  const NOW = new Date('2026-10-02T18:00:00Z').getTime();
  const twoHoursAgo = new Date(NOW - 2 * 60 * 60 * 1000).toISOString();

  test('STALLED: non-terminal, no lifecycle events, created over 1h ago', () => {
    const h = missionHealth(
      row({ status: 'created', created_at: twoHoursAgo, lifecycle_event_count: 0 }),
      NOW,
    );
    expect(h.state).toBe('STALLED');
    expect(h.derived).toBe(true);
    expect(h.reason).toContain('MISSION_ASSIGNED');
  });

  test('not STALLED: recent non-terminal creation with no events yet', () => {
    const recent = new Date(NOW - 10 * 60 * 1000).toISOString();
    const h = missionHealth(
      row({ status: 'created', created_at: recent, lifecycle_event_count: 0 }),
      NOW,
    );
    expect(h.state).toBe('HEALTHY');
  });

  test('not STALLED: old non-terminal but lifecycle events observed', () => {
    const h = missionHealth(
      row({ status: 'running', created_at: twoHoursAgo, lifecycle_event_count: 2 }),
      NOW,
    );
    expect(h.state).toBe('HEALTHY');
  });

  test('ON_HOLD: hold_at set wins even over terminal status', () => {
    const h = missionHealth(
      row({ status: 'completed', hold_at: '2026-10-02T10:00:00Z' }),
      NOW,
    );
    expect(h.state).toBe('ON_HOLD');
    expect(h.derived).toBe(true);
  });

  test.each([['completed'], ['failed'], ['archived']])(
    'TERMINAL: status %s',
    (status) => {
      const h = missionHealth(row({ status }), NOW);
      expect(h.state).toBe('TERMINAL');
      expect(h.derived).toBe(true);
    },
  );

  test('missing created_at never fabricates STALLED', () => {
    const h = missionHealth(
      row({ status: 'created', created_at: null, lifecycle_event_count: 0 }),
      NOW,
    );
    expect(h.state).toBe('HEALTHY');
    expect(h.reason).toContain('insufficient evidence');
  });

  test('null status is non-terminal, so the written STALLED rule applies', () => {
    const h = missionHealth(
      row({ status: null, created_at: twoHoursAgo, lifecycle_event_count: 0 }),
      NOW,
    );
    expect(h.state).toBe('STALLED');
  });
});

describe('projectQueueMission', () => {
  test('projects every field through the mapping', () => {
    const p = projectQueueMission(
      row({ status: 'failed', retries: 3, event_count: 7 }),
    );
    expect(p.mission_id).toBe('m-test-1');
    expect(p.status).toBe('failed'); // raw status verbatim
    expect(p.canonical_state).toBe('FAILED');
    expect(p.retries).toBe(3);
    expect(p.event_count).toBe(7);
    expect(p.health.state).toBe('TERMINAL');
    expect(p.health.derived).toBe(true);
  });
});

describe('projectQueueMissions empty input', () => {
  test('empty in -> empty out (honest empty)', () => {
    expect(projectQueueMissions([])).toEqual([]);
  });
});
