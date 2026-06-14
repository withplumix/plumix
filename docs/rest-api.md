# REST API

Plumix can expose a read-only public REST API with a generated OpenAPI 3.1 spec.
It is **off by default** — enable it explicitly:

```ts
plumix({
  // …
  api: { enabled: true },
});
```

Once enabled:

- `GET /_plumix/api/v1/{collection}` — paginated published entries or taxonomy
  terms (`/posts`, `/categories`, …).
- `GET /_plumix/api/v1/{collection}/{id}` — one entry or term.
- `GET /_plumix/api/v1/{type}/{id}/comments` — when `@plumix/plugin-comments`
  is installed.
- `GET /_plumix/api/v1/openapi.json` — the generated spec.

Anonymous requests see published content only; unviewable content is `404`
(never `403`), so existence stays hidden. An `Authorization: Bearer <pat>` token
reads as its user, gated by scope ∩ role.

## CORS

CORS is **closed by default**, even when the API is enabled. Open anonymous
reads to specific browser origins (or all):

```ts
api: {
  enabled: true,
  cors: { origins: ["https://app.example.com"] }, // or origins: "*"
}
```

PAT-authed responses are never CORS-exposed and never use
`Access-Control-Allow-Credentials`, so a token embedded in browser JS can't be
abused cross-origin — PATs are for server-to-server use.

## Rate limiting

Core ships no in-app rate limiter; the REST surface is a stable path prefix
(`/_plumix/api/`) so you can throttle it at the edge:

- **Cloudflare** — add a WAF rate-limiting rule scoped to
  `http.request.uri.path starts_with "/_plumix/api/"`.
- **Custom** — wrap the generated worker's `fetch` and short-circuit before
  delegating, keying on `request.url` / client IP.

## Docs UI (Scalar / Swagger)

Core serves only the spec. Add a browsable reference as a userland plugin that
serves an HTML page pointing at `/openapi.json`:

```ts
definePlugin("api-docs", {
  setup: (ctx) => {
    ctx.registerRoute({
      method: "GET",
      path: "/docs",
      auth: "public",
      handler: () =>
        new Response(
          `<!doctype html><html><head><meta charset="utf-8" /></head><body>
            <script id="api-reference" data-url="/_plumix/api/v1/openapi.json"></script>
            <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
          </body></html>`,
          { headers: { "content-type": "text/html; charset=utf-8" } },
        ),
    });
  },
});
```

This mounts at `/_plumix/api-docs/docs`. Swap in Swagger UI the same way.
