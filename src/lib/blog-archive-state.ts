export const MAX_ARCHIVE_QUERY_LENGTH = 200;

export interface BlogArchiveState {
  query: string;
  topic: string;
}

function boundedQuery(value: string): string {
  return Array.from(value.trim()).slice(0, MAX_ARCHIVE_QUERY_LENGTH).join("").trim();
}

/** Published topics stay authoritative; a URL cannot create a new category. */
export function readBlogArchiveState(search: string, topics: readonly string[]): BlogArchiveState {
  const params = new URLSearchParams(search);
  const topic = params.get("topic") ?? "";
  return {
    query: boundedQuery(params.get("q") ?? ""),
    topic: topics.includes(topic) ? topic : "",
  };
}

/** Update only this control's parameters, retaining unrelated URL context. */
export function writeBlogArchiveSearch(
  search: string,
  state: BlogArchiveState,
  topics: readonly string[],
): string {
  const params = new URLSearchParams(search);
  const query = boundedQuery(state.query);
  params.delete("q");
  params.delete("topic");
  if (query) params.set("q", query);
  if (topics.includes(state.topic)) params.set("topic", state.topic);
  return params.toString();
}
