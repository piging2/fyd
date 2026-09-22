/**
 * CSS module stub for the object lane: jest moduleNameMapper target.
 * Returns the requested class name so className assertions stay meaningful.
 */
const stub = new Proxy(
  {},
  {
    get: (_target, prop: string | symbol) => String(prop),
  },
);
export default stub;
module.exports = stub;
