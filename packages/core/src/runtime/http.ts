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

export function forbidden(reason: string): Response {
  return jsonResponse({ error: "forbidden", reason }, { status: 403 });
}
