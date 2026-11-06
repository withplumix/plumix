---
"plumix": minor
---

Adds `site.fetch` to the test site from `plumix/test`: it answers `ctx.fetch` from the routes a test declares with `site.fetch.route(method, url, answer)`, where an answer can be a response, a network error or a timeout, and fails the test on any request no route answers. `site.fetch.assertFetched(url, { method, body })` and `assertNotFetched(url)` assert what the site requested, so a test no longer stubs the global `fetch`.
