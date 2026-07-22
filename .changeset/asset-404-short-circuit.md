---
"@plumix/core": patch
---

Stops asset-shaped 404s from paying route resolution and a themed render. A public request whose path ends in a static-asset extension (`.ico`, `.css`, `.js`, images, fonts, `.map`, `.wasm`) short-circuits to a plain-text 404 before the route map runs — previously a stray `favicon.ico` or `/assets/*` miss ran a page-slug lookup plus the full themed 404 page (~9 DB queries per request). Content-plausible extensions (`.txt`, `.xml`, `.json`, `.html`) stay routable.

Two related error-path changes:

- A 404 or 500 for a client whose `Accept` header negotiates away from HTML (e.g. `application/json`) now returns the plain-text error instead of the themed page. Browser-shaped requests, a missing `Accept`, and `*/*` keep the themed render.
- `renderErrorThroughTheme` now opens a `render` telemetry span like the happy path, so error-page queries no longer dangle directly under `dispatch` in traces.
