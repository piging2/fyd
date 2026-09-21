/**
 * Jest config for the visitor Ask FYD route tests (fyd/ask-fyd-visitor lane).
 * Scoped to this lane's tests only. Run with:
 * npx jest --config src/app/api/fyd/ask/jest.config.cjs
 */
module.exports = {
  testEnvironment: "node",
  rootDir: "../../../../..",
  testMatch: ["<rootDir>/src/app/api/fyd/ask/__tests__/*.test.ts"],
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
