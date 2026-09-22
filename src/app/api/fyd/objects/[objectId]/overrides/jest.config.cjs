/**
 * Jest config for the owner overrides patch-loop route tests (fyd/owner patch-loop lane).
 * Scoped to this lane's tests only. Run with:
 * npx jest --config "src/app/api/fyd/objects/[objectId]/overrides/jest.config.cjs"
 */
module.exports = {
  testEnvironment: "node",
  rootDir: "../../../../../../..",
  testMatch: ["<rootDir>/src/app/api/fyd/objects/[objectId]/overrides/__tests__/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "\.(css|scss)$": "<rootDir>/src/app/api/fyd/objects/[objectId]/overrides/__tests__/css-stub.cjs",
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
