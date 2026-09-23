/**
 * Jest config for the src-root middleware regression tests
 * (FYD builder product blockers: /sites must stay reachable).
 * Scoped to this test only. Run with:
 * npx jest --config src/jest.config.cjs
 *
 * Shape harvested from src/fyd/identity/jest.config.cjs.
 */
module.exports = {
  testEnvironment: "node",
  rootDir: "..",
  testMatch: ["<rootDir>/src/__tests__/middleware-sites.test.ts"],
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
