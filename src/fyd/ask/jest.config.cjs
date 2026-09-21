/**
 * Jest config for the Ask FYD lane (fyd/ask-capabilities). Scoped to this
 * lane's tests plus the /api/fyd/ask route tests (same lane); sibling lanes
 * own their own test scope. Run with:
 * npx jest --config src/fyd/ask/jest.config.cjs
 */
module.exports = {
  testEnvironment: "node",
  rootDir: "../../..",
  testMatch: [
    "<rootDir>/src/fyd/ask/__tests__/*.test.ts",
    "<rootDir>/src/app/api/fyd/ask/__tests__/*.test.ts",
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
