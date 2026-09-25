/**
 * Jest config for the EDGE-OBJECT lane (fyd/edge). Scoped to this lane's
 * tests only; sibling lanes own their own test scope. Run with:
 * npx jest --config src/fyd/edge/jest.config.cjs
 *
 * The visibility-parity test lazily imports spec-pipeline (server code);
 * ts-jest compiles it in the node test environment. The real-projection
 * test reads /home/nolan/ping/var/fyd-projections when present and skips
 * gracefully when it is not.
 */
module.exports = {
  testEnvironment: "node",
  rootDir: "../../..",
  testMatch: ["<rootDir>/src/fyd/edge/__tests__/*.test.ts"],
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
