/**
 * Jest config for the FYD motion lane (reveal, before-after, count-up).
 * Scoped to this lane's tests only. Run with:
 * npx jest --config src/fyd/motion/jest.config.cjs
 *
 * Shape harvested from src/fyd/ui/jest.config.cjs. transpile-only mode
 * (isolatedModules); type diagnostics are deferred to tsc on the lane.
 * The browser-interaction suite launches headless Chromium via the
 * playwright package (no jsdom in this repo); it gets a longer timeout.
 */
module.exports = {
  testEnvironment: "node",
  rootDir: "../../..",
  testMatch: ["<rootDir>/src/fyd/motion/__tests__/*.test.{ts,tsx}"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "\\.css$": "<rootDir>/src/fyd/components/__tests__/css-stub.js",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        isolatedModules: true,
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
  testTimeout: 90000,
};
