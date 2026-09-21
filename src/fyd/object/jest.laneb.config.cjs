/**
 * Jest config for Lane B (Card + Node projections).
 *
 * Separate from src/fyd/object/jest.config.cjs (Lane A's file): this one
 * matches the .tsx component proof tests. Run with:
 * npx jest --config src/fyd/object/jest.laneb.config.cjs
 *
 * testEnvironment "node" is enough: the tests assert on
 * react-dom/server renderToStaticMarkup output, no DOM needed.
 */
module.exports = {
  testEnvironment: "node",
  rootDir: "../../..",
  testMatch: ["<rootDir>/src/fyd/object/__tests__/card-node-projections.test.tsx"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^next/link$": "<rootDir>/src/fyd/object/__tests__/next-link-stub.cjs",
    "\\.module\\.css$": "<rootDir>/src/fyd/object/__tests__/css-stub.cjs",
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
