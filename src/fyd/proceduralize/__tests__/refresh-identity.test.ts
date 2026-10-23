import {project} from '../proceduralizer';
import {COPPERSMITH_GRAPH} from '../__fixtures__/coppersmith-graph';
const old = COPPERSMITH_GRAPH.objects[0];
test('refresh retains an existing business key instead of re-minting it', () => {
  const fresh = project([], 'https://www.coppersmithplumbing.com/', '2026-10-05T00:00:00Z', old.controllerId, {refreshFrom:{...old,fields:{}}});
  expect(fresh.objects[0].id).toBe(old.id);
  expect(fresh.objects[0].provenance?.derivedAt).toBe('2026-10-05T00:00:00Z');
  expect(old.provenance?.derivedAt).toBe('2026-09-21T13:50:00Z');
});
test('a different source cannot reuse the business identity', () => {
  expect(() => project([], 'https://another.example/', '2026-10-05T00:00:00Z', old.controllerId, {refreshFrom:old})).toThrow('identity mismatch');
});
test('a different controller cannot use the refresh anchor', () => {
  expect(() => project([], 'https://www.coppersmithplumbing.com/', '2026-10-05T00:00:00Z', 'other-controller', {refreshFrom:old})).toThrow('identity mismatch');
});
test('initial acquisition still follows the existing derived identity rules', () => {
  expect(project([], 'https://www.coppersmithplumbing.com/', '2026-10-05T00:00:00Z', old.controllerId).objects[0].id).not.toBe(old.id);
});
