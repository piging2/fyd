/** Server-side transport limit. Counting decoded characters would miss large byte streams. */
export class PreviewSizeLimitError extends Error {
  constructor() {
    super("The live site page is too large to embed.");
    this.name = "PreviewSizeLimitError";
  }
}

export async function readPreviewHtml(
  response: Response,
  maxBytes: number,
  controller: AbortController,
): Promise<string> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new Error("Invalid preview byte budget");
  const advertised = response.headers.get("content-length");
  if (advertised && /^\d+$/.test(advertised) && Number(advertised) > maxBytes) {
    controller.abort();
    await response.body?.cancel().catch(() => {});
    throw new PreviewSizeLimitError();
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let bytes = 0;
  let html = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return html + decoder.decode();
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        controller.abort();
        await reader.cancel().catch(() => {});
        throw new PreviewSizeLimitError();
      }
      html += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}
