"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { BlogPostMeta } from "@/lib/blog";

function formatDate(date: string) {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function BlogArchive({ posts }: { posts: BlogPostMeta[] }) {
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  useEffect(() => setReady(true), []);

  const tagCounts = new Map<string, number>();
  for (const post of posts) {
    for (const topic of post.tags) {
      tagCounts.set(topic, (tagCounts.get(topic) ?? 0) + 1);
    }
  }
  const tags = [...tagCounts.keys()].sort();
  const matches = posts.filter((post) => (
    (!tag || post.tags.includes(tag)) &&
    (!query || [post.title, post.excerpt, ...post.tags.map((topic) => topic.replaceAll("-", " "))]
      .some((value) => value.toLowerCase().includes(query)))
  ));

  return (
    <>
      <form
        className="mt-5"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(input.trim().toLowerCase());
        }}
        hidden={!ready}
      >
        <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
          <label className="grid gap-1 text-sm font-semibold text-text">
            Search titles and topics
            <input
              type="search"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              className="min-h-11 min-w-0 rounded-lg border border-border bg-background px-3 text-base font-normal"
            />
          </label>
          <div className="grid gap-1 text-sm font-semibold text-text">
            <label htmlFor="blog-archive-topic">Topic</label>
            <select
              id="blog-archive-topic"
              value={tag}
              onChange={(event) => {
                setTag(event.target.value);
                setQuery(input.trim().toLowerCase());
              }}
              className="min-h-11 min-w-0 rounded-lg border border-border bg-background px-3 text-base font-normal"
            >
              <option value="">All articles</option>
              <optgroup label="Common topics">
                {tags.filter((topic) => (tagCounts.get(topic) ?? 0) > 1).map((topic) => (
                  <option key={topic} value={topic}>{topic.replaceAll("-", " ")}</option>
                ))}
              </optgroup>
              <optgroup label="Other topics">
                {tags.filter((topic) => tagCounts.get(topic) === 1).map((topic) => (
                  <option key={topic} value={topic}>{topic.replaceAll("-", " ")}</option>
                ))}
              </optgroup>
            </select>
          </div>
          <div className="flex gap-2 sm:contents">
            <button type="submit" className="min-h-11 rounded-lg bg-honey px-4 text-sm font-semibold text-honey-foreground">
              Search
            </button>
            <button
              type="button"
              className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-text"
              onClick={() => {
                setInput("");
                setQuery("");
                setTag("");
              }}
            >
              Clear
            </button>
          </div>
        </div>
      </form>

      <p role="status" className="my-4 break-words text-sm text-text-muted">
        {matches.length} {matches.length === 1 ? "article" : "articles"}
        {query && <> matching “{query}”</>}
        {tag && <> in {tag.replaceAll("-", " ")}</>}
      </p>
      {matches.length === 0 ? (
        <p className="rounded-lg border border-border-soft p-6 text-text">
          Try a different title or topic, or clear the filters to see all articles.
        </p>
      ) : (
        <div className="space-y-8">
          {matches.map((post) => (
            <article key={post.slug} className="rounded-lg border border-border-soft bg-surface p-6 transition-shadow hover:shadow-md">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                {post.tags.slice(0, 3).map((topic) => (
                  <span key={topic} className="rounded bg-honey/10 px-3 py-1 text-sm font-semibold text-honey-text">
                    {topic}
                  </span>
                ))}
                <time dateTime={post.date} className="text-sm text-text-muted">{formatDate(post.date)}</time>
              </div>
              <h3 className="text-2xl font-bold text-text">
                <Link href={"/blog/" + post.slug} className="underline decoration-transparent underline-offset-4 hover:text-honey-text hover:decoration-current focus-visible:decoration-current">
                  {post.title} <span aria-hidden="true" className="text-honey-text">→</span>
                </Link>
              </h3>
              <p className="mt-2 text-text-muted">{post.excerpt}</p>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
