/** Lane 6 scoped jest config: ts-jest transform for the theme module.
 * The repo root has no jest transform configured, so this lane ships
 * its own. Scoped to this directory; nothing else is affected.
 */
module.exports = {
  rootDir: __dirname,
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["<rootDir>/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      { tsconfig: { strict: true, esModuleInterop: true, target: "ES2017" } },
    ],
  },
};
