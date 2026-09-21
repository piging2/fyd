/**
 * Lane B test stub: next/link renders as a plain anchor under the node test
 * environment. Used only by the lane-B proof tests.
 */
const React = require("react");

module.exports = {
  __esModule: true,
  default: function LinkStub({ href, children, ...rest }) {
    return React.createElement("a", { href, ...rest }, children);
  },
};
