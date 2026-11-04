import { NextResponse } from "next/server";
import { getAllPosts } from "@/lib/blog";
import { getTenant } from "@/lib/tenant-config";
import { buildRssFeed } from "@/lib/rss";

/**
 * GET /rss.xml (Wave 28, B-21): RSS 2.0 feed of published blog posts
 * only, built from the blog data layer in its canonical order.
 * Episodes keep their existing external podcast RSS, which is a
 * different medium and is not part of this feed.
 */
export async function GET() {
  const siteUrl =
    getTenant().domain ??
    (process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "https://fyd-product.vercel.app");
  const xml = buildRssFeed(getAllPosts(), siteUrl);
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
