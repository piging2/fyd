// hostile-g2.mts: cross-process G2 proof. Run N times as SEPARATE processes
// with different runner labels and shuffled page order; every run must emit
// the SAME business id for the same source.
// Usage: tsx hostile-g2.mts <runnerLabel> <shuffleSeed>
// Prints the business id (and full id set) as JSON.
import { runExtractionPipeline } from "/home/nolan/projects/ping/src/fyd/proceduralize/proceduralizer";

const [runnerLabel, seedStr] = process.argv.slice(2);
const seed = Number(seedStr ?? "0");

function mulberry(seedN: number) {
  let s = seedN >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pages = [0, 1, 2].map((i) => ({
  url: "https://bemiselectric.com/",
  sourceType: "html" as const,
  discoveredAt: "2026-09-24T12:00:00.000Z",
  ok: true,
  status: 200,
  raw: `<!DOCTYPE html><html><head><title>Bemis Electric</title>
<meta property="og:title" content="Bemis Electric" />
<meta property="og:description" content="Family-run electricians." />
<meta property="og:url" content="https://bemiselectric.com/" />
</head><body><h1>Bemis Electric</h1><p>Call 555-0100</p></body></html>`,
}));

// Shuffle page order deterministically by seed: different order per run.
const rnd = mulberry(seed);
const shuffled = [...pages].sort(() => rnd() - 0.5);

const out = await runExtractionPipeline(shuffled as never, {
  sourceUrl: "https://bemiselectric.com/",
  observedAt: "2026-09-24T12:00:00.000Z",
  controllerId: runnerLabel,
} as never);

const ids = out.graph.objects.map((o) => o.id).sort();
const biz = out.graph.objects.find((o) => o.schema === "ping.social.business@1")!.id;
console.log(JSON.stringify({ runner: runnerLabel, seed, businessId: biz, objectIds: ids }));
