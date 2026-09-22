/**
 * Jest config for the FYD object lane (projection, services, owner store).
 * Scoped to this lane's tests only. Run with:
 * npx jest --config src/fyd/object/jest.config.cjs
 *
 * Shape harvested from src/fyd/media/jest.config.cjs.
 */
module.exports = {
  testEnvironment: "node",
  rootDir: "../../..",
  testMatch: ["<rootDir>/src/fyd/object/__tests__/*.test.{ts,tsx}"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "\.module\.css$": "<rootDir>/src/fyd/object/__tests__/css-stub.ts",
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
