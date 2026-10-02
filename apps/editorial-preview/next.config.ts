import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
  experimental: { externalDir: true },
  devIndicators: false,
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
};
export default config;
