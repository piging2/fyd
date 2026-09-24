// Node module customization hooks: stub out .css imports (CSS modules)
// so server-side execution of .tsx components works under tsx/node.
// Pattern vendored from /home/nolan/fyd-proof-run/css-loader.mjs.
export async function resolve(specifier, context, next) {
  const res = await next(specifier, context);
  if (res.url.endsWith(".css")) return { ...res, shortCircuit: true };
  return res;
}
export async function load(url, context, next) {
  if (url.endsWith(".css")) {
    return { format: "module", source: "export default {};", shortCircuit: true };
  }
  return next(url, context);
}
