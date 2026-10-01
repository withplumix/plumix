/** The named groups a URLPattern match captured from the path, as strings. */
export function extractParams(
  pathname: URLPatternComponentResult,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(pathname.groups)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}
