/**
 * Jest config for the FYD onboarding lane primitives (order G + J):
 * fyd/net (SSRF gate, budgets, rate limit), fyd/claim (resource-claim
 * state machine, verification seam, store), fyd/onboarding (anonymous
 * preview service, evidence extractor).
 *
 * One config for the lane's new tests; do not add another.
 * Run with: npx jest --config src/fyd/net/jest.config.cjs
 *
 * Shape harvested from src/fyd/media/jest.config.cjs.
 */
module.exports = {
  testEnvironment: "node",
  rootDir: "../../..",
  testMatch: [
    "<rootDir>/src/fyd/net/__tests__/*.test.ts",
    "<rootDir>/src/fyd/claim/__tests__/*.test.ts",
    "<rootDir>/src/fyd/onboarding/__tests__/*.test.ts",
    "<rootDir>/src/app/api/fyd/claims/[resourceId]/__tests__/*.test.ts",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
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
