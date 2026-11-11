/** The consent page leaves only for an http(s) URL, whatever the server returns. */
export function isHttpUrl(value: string): boolean {
  const protocol = URL.parse(value)?.protocol;
  return protocol === "https:" || protocol === "http:";
}
