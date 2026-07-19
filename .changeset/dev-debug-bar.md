---
"@plumix/core": minor
"@plumix/runtime-cloudflare": minor
---

Add a development-only debug bar.

Running `plumix dev` now renders a per-request debug bar, inspired by the
WordPress Debug Bar and framework devtools. It is compiled out of production
builds entirely (gated on `process.env.PLUMIX_DEV`), so it ships nothing to
production.

Panels cover the current **Request** (method, path, origin, and the
authenticated user + token scopes), the resolved **Template** hierarchy (the
ordered candidate list and which one won), **Database** queries (SQL syntax
highlighting with the bound params shown separately), an **App** tab
consolidating the site's static setup (config, locale, wired slots, installed
plugins, and registered content types), and a **Timeline** waterfall of the
request's spans — dispatch, resolve, render, and each database query, timed and
nested by call structure.

The bar is zero-JS (a server-rendered `<details>` element with CSS-driven tabs)
and extensible: plugins add panels through the `debug_bar:panels` hook and
record data through the request-scoped `ctx.debug` collector. Configure it via
`debugBar` (enable/disable, position, which panels to hide). On Cloudflare, D1
queries are surfaced in the Database and Timeline panels as well.
