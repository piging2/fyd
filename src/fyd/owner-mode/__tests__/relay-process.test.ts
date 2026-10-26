import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

test('P0 reference relay reproduces races and crash windows using isolated processes', () => {
  const result = spawnSync(process.execPath, [join(process.cwd(), 'scripts/fyd-relay/p0/run.mjs')], {
    encoding: 'utf8', timeout: 90000,
    env: {
      PATH: process.env.PATH,
      ...(process.env.FYD_RELAY_P0_ARTIFACT_DIR ? { FYD_RELAY_P0_ARTIFACT_DIR: process.env.FYD_RELAY_P0_ARTIFACT_DIR } : {}),
    },
  });
  expect({ status: result.status, error: result.error?.message, stdout: result.stdout, stderr: result.stderr }).toEqual({
    status: 0, error: undefined, stdout: expect.stringContaining('PASS crash-after-acceptance'), stderr: '',
  });
}, 95000);
