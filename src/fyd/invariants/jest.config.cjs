/**
 * Jest config for the LANE-INVARIANTS probe suite (500-site factory stress
 * program). Scoped to this lane's tests only. New lane-contained files;
 * no shared files are modified.
 *
 * Run with: npx jest --config src/fyd/invariants/jest.config.cjs
 * Shape harvested from src/fyd/owner-mode/jest.config.cjs.
 */
module.exports = {
  testEnvironment: "node",
  rootDir: "../../..",
  testMatch: ["<rootDir>/src/fyd/invariants/__tests__/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "\\.css$": "<rootDir>/src/fyd/components/__tests__/css-stub.js",
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
