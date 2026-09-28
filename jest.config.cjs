/**
 * Standard repo-root Jest config. THE canonical test entry point:
 *
 *   npx jest              (from repo root; runs every suite)
 *   npm test              (same thing)
 *
 * One command replaces the per-area scratch configs. The per-area
 * configs (src/fyd/<lane>/jest.config.cjs, src/app/api/fyd/...,
 * src/motion/jest.config.cjs) are kept as-is for lane-local runs:
 *
 *   npx jest --config src/fyd/customize/jest.config.cjs
 *
 * All per-area configs are functionally identical (node env, ts-jest
 * with the same inline tsconfig, @/ alias); only their testMatch scope
 * and css-stub variant differ. The root config covers every suite:
 * testMatch picks up every suite under src (all __tests__ directories),
 * including areas that never had a per-area config (attention, claim,
 * refresh, resolve/spike, rank, src/lib, src/lib/ping).
 *
 * See TESTING.md for the known-failing list.
 */
module.exports = {
  testEnvironment: "node",
  rootDir: __dirname,
  testMatch: ["<rootDir>/src/**/__tests__/*.test.{ts,tsx}"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "\\.(css|scss)$": "<rootDir>/jest/css-stub.cjs",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          target: "ES2017",
          module: "commonjs",
          moduleResolution: "node",
          jsx: "react-jsx",
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
        },
      },
    ],
  },
};
