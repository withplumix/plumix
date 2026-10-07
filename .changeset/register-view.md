---
"plumix": minor
---

Adds `ctx.registerView(name, { routes, access?, cacheable?, resolve })` for per-visitor app pages such as `/login`, `/account` or `/compare/:id`. A view renders through the theme like any page, with its template, `document()` and access policy, but lists nothing. Target it with `forView(name)` from `plumix/theme`, or let the theme's `fallback` render it. Its template receives `kind: "view"`, the view's `name`, the route `params` and the `data` its `resolve` returned, typed through `ViewRegistry`. `resolve` returns `{ data, title, tags? }` or `null` for a 404, and can throw `redirectTo()` or `pageNotFound()`. A view is never stored by the CDN unless it sets `cacheable: true`, and gets no automatic canonical link. `PageFacts` gains `view`, the registered name on a view page. Unlisted `registerArchiveType` registrations keep working, but a page that lists nothing and differs per visitor should move to `registerView`.
