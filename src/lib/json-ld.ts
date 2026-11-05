/** Preserve JSON facts without letting content terminate its HTML script element. */
export function serializeJsonLd(value: object): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
