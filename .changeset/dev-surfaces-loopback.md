---
"@plumix/plugin-og": minor
"@plumix/core": minor
"plumix": minor
---

Puts a second gate in front of every development-only surface. `PLUMIX_DEV` says a dev server is
running; it says nothing about who reached it, and `plumix dev` is routinely reachable from off-box
— a tunnel opened to test a webhook, a container bound to `0.0.0.0`, a forwarded codespace port.
Core now also requires the request to have arrived over loopback before it injects the debug bar,
serves `/_plumix/debug/requests`, or renders the dev error page, and the Vite plugin applies the
same rule to the dev endpoints that answer ahead of the worker — the source-excerpt reader behind
the error page's frames, the two sourcemap resolvers, and the browser-errors-to-terminal sink.
Off-loopback each is absent rather than refused: no bar in the markup, a 404 on the history, and
the theme's own `server-error` page in place of the dev one. What is withheld is the disclosure,
not the site.

Adds `auth: "development"` to the plugin route model, so a route that exists only while you are
developing declares that rather than `auth: "public"` and inherits the same two gates. It answers
404 off-loopback, since the existence of the route is itself development detail. The OG plugin's
card preview takes it — the surface that motivated the change, since it runs a theme-authored
`render` and resolves whatever template deps the card declared against a request carrying no
session. `registerRestResource` keeps the narrower `RestResourceAuth`: a REST resource is part of
the documented public API and has nowhere to publish a dev-only gate.

`PLUMIX_DEV_ALLOW_REMOTE=1` is the deliberate opt-out, for reviewing on a phone, demoing through a
tunnel or working in a codespace. Like the other dev-only variables it is substituted at bundle
time and empty in a production build, so it cannot follow you to a deploy. The MCP endpoint keeps
its own stricter gate — off-loopback it falls back to bearer-token authentication rather than
closing, so the opt-out has nothing to open there.
