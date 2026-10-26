// Test-only substitutions. The archived reference is never rewritten.
const referenceSuffix = '/reference/worker-20261025.mjs';
const replacements = {
  '@vercel/blob': './blob-shim.mjs',
  nodemailer: './smtp-shim.mjs',
  'node:fs': './no-credentials.mjs',
  'node:os': './test-home.mjs',
};

export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith(referenceSuffix) && replacements[specifier]) {
    return { url: new URL(replacements[specifier], import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
