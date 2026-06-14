// Clone a response, preserving its body/status, with mutated headers — for
// adding headers to a response produced elsewhere (CORS, cache directives).
export function withHeaders(
  response: Response,
  mutate: (headers: Headers) => void,
): Response {
  const headers = new Headers(response.headers);
  mutate(headers);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }
  return new Response(JSON.stringify(body), { ...init, headers });
}

export function notFound(hint?: string): Response {
  const headers = new Headers({ "content-type": "text/plain; charset=utf-8" });
  if (hint) headers.set("x-plumix-hint", hint);
  return new Response("Not Found", { status: 404, headers });
}

export function methodNotAllowed(allowed: readonly string[]): Response {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: {
      allow: allowed.join(", "),
      "content-type": "text/plain; charset=utf-8",
    },
  });
}

export function unauthorized(): Response {
  return jsonResponse({ error: "unauthorized" }, { status: 401 });
}

export function forbidden(reason: string): Response {
  return jsonResponse({ error: "forbidden", reason }, { status: 403 });
}

export function redirectTo(
  location: string,
  extraHeaders: Record<string, string> = {},
): Response {
  const headers = new Headers({ Location: location, ...extraHeaders });
  return new Response(null, { status: 302, headers });
}

export function loginErrorRedirect(
  loginPath: string,
  paramName: string,
  code: string,
): Response {
  const params = new URLSearchParams({ [paramName]: code });
  return redirectTo(`${loginPath}?${params.toString()}`);
}
