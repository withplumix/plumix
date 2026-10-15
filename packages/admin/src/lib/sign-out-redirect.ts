/**
 * The server sanitises the URL before sending it (https:// or a same-origin
 * path, no CR/LF); checked again so a server bug can't become a client-side
 * open redirect.
 */
export function sanitiseRedirect(
  value: string | null | undefined,
): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (/[\r\n]/.test(value)) return null;
  const sameOriginPath = value.startsWith("/") && !value.startsWith("//");
  const httpsAbsolute = value.startsWith("https://");
  return sameOriginPath || httpsAbsolute ? value : null;
}
