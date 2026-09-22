/**
 * Jest config for the FYD builder composition lane: component registry,
 * ObjectRail placement law, and the golden /build route shell.
 * Run with: npx jest --config src/fyd/components/jest.config.cjs
 * Shape harvested from src/fyd/proceduralize/jest.config.cjs; adds a CSS
 * stub because the rail tests import build-client, which pulls in
 * object-circle's CSS module through the ObjectCircle doorway.
 */
module.exports = {
  testEnvironment: "node",
  rootDir: "../../..",
  testMatch: ["<rootDir>/src/fyd/components/__tests__/*.test.ts"],
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
