/**
 * Root-level CSS stub for the standard Jest config (jest.config.cjs).
 * Returns the requested class name so className assertions stay meaningful.
 * Equivalent to src/fyd/object/__tests__/css-stub.ts.
 */
const stub = new Proxy(
  {},
  {
    get: (_target, prop) => String(prop),
  },
);
module.exports = stub;
