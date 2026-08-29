---
"@plumix/core": minor
"plumix": minor
"@plumix/plugin-comments": patch
"@plumix/plugin-forms": patch
---

Publishes the five helpers the forms and comments plugins had each written for themselves, and
fixes a return-URL bug in `@plumix/plugin-forms` on the way.

Each of the five was a fact about core's own wire format — the header its CSRF gate reads, the
marker its islands bootstrap writes, the origin rule its dispatcher enforces — that a plugin had to
rediscover. Core is now the one that says them.

`resolveReturnUrl` on `plumix` resolves where to send a visitor after a form post the browser
submitted, holding every candidate to an origin the site answers on and refusing the endpoint's own
path, so the answer can be turned into neither an open redirect nor a loop.

`useIsLive`, `documentBasePath` and `VISUALLY_HIDDEN_STYLE` join `plumix/blocks/renderer`.
`useIsLive` is false through the server render and the first client render and true once a
component is live, which is how progressive enhancement tells markup that shipped from JavaScript
that ran. `documentBasePath` reads the subdirectory prefix off the islands bootstrap marker, for
the callers `useBasePath` cannot serve because a hydrated island has no `PlumixProvider` context.
`VISUALLY_HIDDEN_STYLE` is the `.sr-only` recipe inline, so hiding never depends on a stylesheet
the page did not load.

`CSRF_HEADER_NAME` and `CSRF_HEADER_VALUE` are now on `plumix/blocks`, alongside the existing
export from `plumix`. They are defined in `@plumix/blocks` and re-exported by core rather than the
reverse: the senders are islands, and a `"use client"` module reaching for `plumix` to name the
header would pull the database, the authenticator and the dispatcher into a browser bundle.

The forms fix: its own copy of the return-URL resolver parsed each candidate with no base and
accepted only the configured origin. A relative `returnTo` — the natural thing for a template to
pass — was refused outright rather than read as a path on the site, and on a multi-host deploy
every candidate failed the origin test, so every submitter was sent to the site root. The shared
resolver accepts both the request's origin and the configured one, which is the pair the
dispatcher's own Origin check accepts.

No public API was removed from either plugin; the copies were internal.
