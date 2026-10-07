---
"plumix": minor
---

Adds `pageNotFound()` and `redirectTo(location, status?)` to `plumix/support`. An archive type's `resolve`, a template dep, a block loader on an entry page, or a template's `document()` can throw one to answer the page with the theme's 404 or a redirect. A redirect defaults to 302 and is never cached. Block loaders now run before the template's `document()`, which may be async, so the head can read what a loader found through `ctx.memo`.
