/**
 * Jest config for the FYD tenant-boundary lane (Lane T).
 *
 * REPO LANDING PATH: src/fyd/tenant/jest.config.cjs
 * (Copy the whole tests/ tree into src/fyd/tenant/, then run from the
 * repo root: npx jest --config src/fyd/tenant/jest.config.cjs)
 */
module.exports = {
  testEnvironment: "node",
  rootDir: "../../..",
  testMatch: ["<rootDir>/src/fyd/tenant/__tests__/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "\\.css$": "<rootDir>/src/fyd/tenant/__tests__/css-stub.js",
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
