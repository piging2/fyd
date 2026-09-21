/**
 * Jest config for the FYD proceduralize lane (site generator + patch +
 * proceduralizer). Scoped to this lane's tests only; sibling lanes own
 * their own test scope. Run with:
 * npx jest --config src/fyd/proceduralize/jest.config.cjs
 *
 * Shape harvested from src/fyd/ask/jest.config.cjs (same preset, same
 * ts-jest inline tsconfig); only rootDir-relative testMatch differs.
 */
module.exports = {
  testEnvironment: "node",
  rootDir: "../../..",
  testMatch: ["<rootDir>/src/fyd/proceduralize/__tests__/*.test.ts"],
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
