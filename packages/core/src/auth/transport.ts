import { CSRF_HEADER_NAME, CSRF_HEADER_VALUE } from "../csrf-header.js";

/**
 * How the caller reached an auth route, which picks the shape of the answer:
 * JSON for a fetch, a redirect for a navigation or a plain form.
 */
export type AuthTransport = "fetch" | "navigation" | "form";

export function transportOf(request: Request): AuthTransport {
  if (request.headers.get(CSRF_HEADER_NAME) === CSRF_HEADER_VALUE) {
    return "fetch";
  }
  return request.method === "POST" ? "form" : "navigation";
}

/** `303` turns a form post's POST into a GET of the target. */
export function redirectFor(
  transport: Exclude<AuthTransport, "fetch">,
  location: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(null, {
    status: transport === "form" ? 303 : 302,
    headers: { location, ...headers },
  });
}
