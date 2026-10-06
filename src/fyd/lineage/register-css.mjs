// Registers the CSS stub hooks for both ESM (tsx) and CJS require paths.
// Pattern vendored from /home/nolan/fyd-proof-run/register-css.mjs.
import { register, createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, "css-loader.mjs")).href);
createRequire(import.meta.url).extensions[".css"] = (m) => {
  m.exports = {};
};
