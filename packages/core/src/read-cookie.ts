/**
 * Reads the Cookie header only, never URL or form: session ids must not be
 * readable from form submissions or query parameters.
 */
export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (key !== name) continue;
    const value = part.slice(eq + 1).trim();
    return value === "" ? null : value;
  }
  return null;
}
