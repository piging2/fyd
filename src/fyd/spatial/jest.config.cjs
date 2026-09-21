/**
 * Jest config for the portal lanes (preview, spatial, rank, attention).
 * Scoped to this lane's tests only. Run with:
 * npx jest --config src/fyd/spatial/jest.config.cjs
 *
 * Shape harvested from src/fyd/media/jest.config.cjs.
 */
module.exports = {
  testEnvironment: "node",
  rootDir: "../../..",
  testMatch: [
    "<rootDir>/src/fyd/spatial/__tests__/*.test.ts",
    "<rootDir>/src/fyd/rank/__tests__/*.test.ts",
    "<rootDir>/src/fyd/attention/__tests__/*.test.ts",
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
          esModuleInterop: true,
          strict: true,
        },
      },
    ],
  },
};
