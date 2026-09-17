/**
 * Blog Authority Adapter
 *
 * The blog is the long-term technical publication layer. Posts are Markdown
 * files in src/content/blog with YAML frontmatter. Tenant B adds its own
 * content directory; the loader and rendering stay in platform code.
 *
 * No new dependencies: frontmatter parses with the `yaml` package already
 * in the dependency tree, and rendering uses a minimal built-in renderer
 * for the Markdown subset the publication uses.
 */

import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";

export interface BlogPostMeta {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  tags: string[];
  status: "published" | "draft";
}

export interface BlogPost extends BlogPostMeta {
  body: string;
}

const CONTENT_DIR = path.join(process.cwd(), "src", "content", "blog");

interface Frontmatter {
  title?: string;
  date?: string;
  excerpt?: string;
  tags?: string[];
  status?: "published" | "draft";
}

function parsePostFile(filename: string): BlogPost | null {
  const slug = filename.replace(/\.md$/, "");
  const raw = fs.readFileSync(path.join(CONTENT_DIR, filename), "utf-8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  const fm = (parseYaml(match[1]) || {}) as Frontmatter;
  if (!fm.title || !fm.date) return null;
  return {
    slug,
    title: fm.title,
    date: fm.date,
    excerpt: fm.excerpt ?? "",
    tags: fm.tags ?? [],
    status: fm.status ?? "published",
    body: match[2].trim(),
  };
}

function readAllPosts(): BlogPost[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".md"))
    .map(parsePostFile)
    .filter((p): p is BlogPost => p !== null)
    .filter((p) => p.status === "published")
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getAllPosts(): BlogPostMeta[] {
  return readAllPosts().map(({ body: _body, ...meta }) => meta);
}

export function getPost(slug: string): BlogPost | null {
  return readAllPosts().find((p) => p.slug === slug) ?? null;
}

export function getAllSlugs(): string[] {
  return readAllPosts().map((p) => p.slug);
}

// ---------------------------------------------------------------------------
// Minimal Markdown renderer for the publication subset:
// headings, bold, italic, inline code, fenced code, lists, links, quotes.
// Output is escaped HTML; only the constructs below generate tags.
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(s: string): string {
  let out = escapeHtml(s);
  out = out.replace(/`([^`]+)`/g, "<code class=\"rounded bg-surface-muted px-1.5 py-0.5 text-sm\">$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<a href=\"$2\" class=\"text-honey hover:underline\">$1</a>");
  return out;
}

export function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const html: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCode) {
        html.push(`<pre class="overflow-x-auto rounded-lg bg-deep p-4 text-sm text-text-on-dark"><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
        codeBuf = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }
    const trimmed = line.trim();
    if (trimmed === "") {
      closeList();
      continue;
    }
    const h3 = trimmed.match(/^###\s+(.*)/);
    const h2 = trimmed.match(/^##\s+(.*)/);
    const h1 = trimmed.match(/^#\s+(.*)/);
    if (h3) {
      closeList();
      html.push(`<h3 class="mt-8 text-xl font-bold text-text">${renderInline(h3[1])}</h3>`);
      continue;
    }
    if (h2) {
      closeList();
      html.push(`<h2 class="mt-10 text-2xl font-bold text-text">${renderInline(h2[1])}</h2>`);
      continue;
    }
    if (h1) {
      closeList();
      html.push(`<h1 class="mt-6 text-3xl font-bold text-text">${renderInline(h1[1])}</h1>`);
      continue;
    }
    if (trimmed.startsWith("> ")) {
      closeList();
      html.push(`<blockquote class="border-l-4 border-honey pl-4 italic text-text-muted">${renderInline(trimmed.slice(2))}</blockquote>`);
      continue;
    }
    const li = trimmed.match(/^[-*]\s+(.*)/);
    if (li) {
      if (!inList) {
        html.push("<ul class=\"list-disc space-y-2 pl-6 text-text-muted\">");
        inList = true;
      }
      html.push(`<li>${renderInline(li[1])}</li>`);
      continue;
    }
    closeList();
    html.push(`<p class="mt-4 text-text-muted" style="line-height: var(--leading-body)">${renderInline(trimmed)}</p>`);
  }
  closeList();
  if (inCode) {
    html.push(`<pre class="overflow-x-auto rounded-lg bg-deep p-4 text-sm text-text-on-dark"><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
  }
  return html.join("\n");
}
