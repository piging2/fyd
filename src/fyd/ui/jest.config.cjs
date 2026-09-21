/**
 * Jest config for the FYD UI lane (FydCircle component + circle state machine).
 * Scoped to this lane's tests only. Run with:
 * npx jest --config src/fyd/ui/jest.config.cjs
 *
 * Shape harvested from src/fyd/object/jest.config.cjs. This lane uses
 * transpile-only mode (isolatedModules): the tests assert runtime behavior,
 * and the CircleProjection shapes land in @/fyd/object/types from a parallel
 * worker, so type diagnostics are intentionally deferred to the app build.
 */
module.exports = {
  testEnvironment: "node",
  rootDir: "../../..",
  testMatch: ["<rootDir>/src/fyd/ui/__tests__/*.test.{ts,tsx}"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        isolatedModules: true,
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
