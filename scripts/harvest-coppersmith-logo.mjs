/** Reproduce the authorized Coppersmith logo harvest; run from repository root.
 * Native alpha is preserved. No recoloring, redrawing, background synthesis or upscaling.
 * This is a bounded, site-specific recipe, not a general-purpose URL fetch endpoint.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const output = path.resolve(process.argv[2] ?? 'public/marks');
const sourcePage = 'https://www.coppersmithplumbing.com/';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sources = [
  { tone: 'light', filename: 'coppersmith-logo-black-n-copper.png', expectedSha256: '36e4ff5cab1bafa809ab3d555bdf4b85617157da2ed0e88311e184d942eba668' },
  { tone: 'dark', filename: 'coppersmith-new-logo-white.png', expectedSha256: '381a361fbdbd5713b5e02661c2c4f26b88203d6a49f2cdb5cd7acf48d00ebfeb' },
];
await fs.mkdir(path.join(output, 'sources/coppersmith'), { recursive: true });
const receipt = {
  schema: 'ping.logo-harvest@1', sourcePage, observedAt: new Date().toISOString(),
  objectIds: ['coppersmith-plumbing', 'website-business-2f1327c09d622175'],
  authorization: 'Nolan explicitly authorized harvesting and presentation of the Coppersmith site logo in this session.',
  ownerSupplied: false, cutout: true,
  procedure: 'Download official PNG; verify alpha; crop alpha-empty margins with 2px transparent padding; resize down using Lanczos3; encode lossless WebP; preserve original PNG and SHA-256 lineage.',
  sources: [],
};
for (const source of sources) {
  const sourceUrl = `${sourcePage}wp-content/uploads/2024/04/${source.filename}`;
  const response = await fetch(sourceUrl, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png')) throw new Error(`Invalid PNG response: ${sourceUrl}`);
  const original = Buffer.from(await response.arrayBuffer());
  if (original.length > 2_000_000) throw new Error('Unexpected source size');
  if (hash(original) !== source.expectedSha256) throw new Error('Upstream artwork changed. Review new bytes and refresh both source and presentation digests before publishing.');
  const metadata = await sharp(original, { limitInputPixels: 4_000_000 }).metadata();
  if (metadata.format !== 'png' || !metadata.hasAlpha) throw new Error('Expected original transparent PNG; inspect manually before proceeding');
  const { data, info } = await sharp(original).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1, transparent = 0, semiTransparent = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const alpha = data[(y * info.width + x) * 4 + 3];
    if (!alpha) { transparent++; continue; }
    if (alpha < 255) semiTransparent++;
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  if (right < left || !transparent) throw new Error('Missing cutout pixels or transparent background');
  const bounds = { left, top, width: right - left + 1, height: bottom - top + 1 };
  const master = await sharp(original).extract(bounds).extend({ top: 2, bottom: 2, left: 2, right: 2, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const sourcePath = `sources/coppersmith/${source.filename}`;
  await fs.writeFile(path.join(output, sourcePath), original);
  const masterName = `coppersmith-logo-on-${source.tone}.png`;
  await fs.writeFile(path.join(output, masterName), master);
  const entry = { sourceUrl, originalPath: sourcePath, originalSha256: hash(original), bytes: original.length,
    width: info.width, height: info.height, transparentPixels: transparent, semiTransparentPixels: semiTransparent,
    crop: bounds, padding: 2, master: { file: masterName, sha256: hash(master), width: bounds.width + 4, height: bounds.height + 4 }, variants: [] };
  for (const density of [1, 2, 3]) {
    const width = 96 * density;
    if (width > bounds.width + 4) throw new Error('Refusing to upscale logo');
    const { data: bytes, info: variant } = await sharp(master).resize({ width, withoutEnlargement: true, kernel: 'lanczos3' }).webp({ lossless: true, effort: 6 }).toBuffer({ resolveWithObject: true });
    const file = `coppersmith-logo-on-${source.tone}${density === 1 ? '' : `@${density}x`}.webp`;
    await fs.writeFile(path.join(output, file), bytes);
    entry.variants.push({ file, density, width: variant.width, height: variant.height, bytes: bytes.length, sha256: hash(bytes), derivedFrom: entry.originalSha256 });
  }
  receipt.sources.push(entry);
}
await fs.writeFile(path.join(output, 'coppersmith-logo.harvest.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
