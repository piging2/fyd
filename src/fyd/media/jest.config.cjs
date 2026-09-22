/**
 * Jest config for the FYD media lane (safe fetch, derivatives, ingest).
 * Scoped to this lane's tests only. Run with:
 * npx jest --config src/fyd/media/jest.config.cjs
 *
 * Shape harvested from src/fyd/proceduralize/jest.config.cjs.
 */
module.exports = {
  testEnvironment: "node",
  rootDir: "../../..",
  testMatch: ["<rootDir>/src/fyd/media/__tests__/*.test.ts"],
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
