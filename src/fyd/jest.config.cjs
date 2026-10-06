/**
 * Jest config for the FYD builder  lane. Scoped to this lane's tests
 * only. Run with: npx jest --config src/fyd//jest.config.cjs
 * Shape harvested from src/fyd/proceduralize/jest.config.cjs.
 */
module.exports = {
  testEnvironment: "node",
  rootDir: "../..",
  testMatch: ["<rootDir>/src/fyd//__tests__/*.test.ts",
    "<rootDir>/src/fyd/ui/__tests__/placement.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\.tsx?$": [
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
