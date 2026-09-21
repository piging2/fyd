/**
 * Lane B test stub: CSS modules resolve to a proxy whose class names are
 * the requested keys. Deterministic; used only by the lane-B proof tests so
 * the existing ObjectCircle primitive can render under node.
 */
module.exports = new Proxy(
  {},
  {
    get(_target, key) {
      return typeof key === "string" ? key : "";
    },
  },
);
