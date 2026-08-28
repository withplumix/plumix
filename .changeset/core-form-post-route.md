---
"@plumix/core": minor
"plumix": minor
---

Adds `formPost: true` to `registerRoute`, so a public plugin route can accept a submission from a
plain HTML form. Every path under `/_plumix/` sits behind a CSRF gate requiring the
`X-Plumix-Request` header, and a browser cannot set a custom header on an ordinary form POST — so
until now no plugin route could serve a no-JavaScript submit at all.

The opt-in drops the header requirement and leaves the Origin check as the whole control: an exempt
request has to carry an Origin (or Referer) matching the site, where an ordinary one is only
rejected for contradicting it. It exempts the POST and nothing else — a route registered as
`method: "*"` still gates every other write method — and never a path core answers itself, so a
plugin id that happens to name one of core's own prefixes cannot drop the gate in front of a route
it never serves. The same-origin and dev-loopback allowances are unchanged, and a
route that did not take the opt-in is gated exactly as before — including a sibling route on the
same plugin prefix.

It is valid only on `auth: "public"`; taking it on an authenticated, capability-gated or dev-only
route throws at registration. The reasoning is what the header gate defends: a cross-origin POST
carrying ambient session authority. A public submission carries none, so an attacker forging one has
merely submitted a form they could have submitted directly.

That holds only while the handler never derives privilege from a session, so the dispatcher takes
the session away rather than trust the handler to ignore it: on the exempt POST `ctx.authenticator`
resolves nobody — `getContext()` included, so a hook listener the handler fires sees the same
anonymous request — while a header-carrying POST to the same route keeps its session. Only the
authenticator is swapped; the session cookie is still on `ctx.request`.

Also fixes a latent bug this uncovered: the edge-cache purge accumulator keyed its pending tags on
the `AppContext` object, so tags enqueued against a derived context (basePath stripping, `withUser`)
were dropped by the flush, which runs against the outermost one. It now keys on the request memo,
which is what `tagCacheEntry` already did for the same reason.
