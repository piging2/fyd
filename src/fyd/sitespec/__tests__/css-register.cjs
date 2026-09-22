// Stub .css imports for the tsx determinism-probe child process.
// tsx compiles TS to CJS, so a require.extensions handler is enough.
// The probe only builds the semantic render model; an empty style map
// keeps style imports from breaking the child process.
require.extensions[".css"] = function (module) {
  module.exports = {};
};
