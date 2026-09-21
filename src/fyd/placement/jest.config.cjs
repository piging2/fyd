/**
 * Jest config for the placement lane (rail rule + engagement reconciliation).
 * Scoped to this lane's tests only. Run with:
 * npx jest --config src/fyd/placement/jest.config.cjs
 *
 * Shape harvested from src/fyd/spatial/jest.config.cjs.
 */
module.exports = {
  testEnvironment: "node",
  rootDir: "../../..",
  testMatch: ["<rootDir>/src/fyd/placement/__tests__/*.test.ts"],
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
          esModuleInterop: true,
          strict: true,
        },
      },
    ],
  },
};
