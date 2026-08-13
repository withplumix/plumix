---
"@plumix/core": minor
---

Key the edge cache on the access-policy segment, so signed-in visitors share
cached renders instead of each bypassing the cache.

A policied route resolves to a discrete segment (`anonymous`, `authenticated`,
`role:<role>`, or a developer's `entitlement:<label>`); that segment now
participates in the cache key. Two visitors in the same non-private segment whose
render is byte-identical share one edge entry — the "subscribers-only" page is
cached once per segment at its real URL instead of rendering live for every
logged-in request. The cache-tag vocabulary (`t:` / `e:`) is unchanged, so one
publish of an entry still purges every segment variant at once.

```ts
// Shared-cacheable for all logged-in visitors — the explicit opt-in.
ctx.registerEntryType("article", { access: { default: authenticatedPolicy } });

// Gated but never shared-cached — the escape hatch for a personalized page.
definePolicy({ resolve: (c) => (c.user ? grant("private") : redirectToLogin()) });
```

A new built-in `private` segment is the escape hatch: its render is per-visitor
and never read from or written to the shared cache. Un-policied pages are
unchanged — an anonymous request caches under the plain URL exactly as before,
and a request carrying a session (or an `Authorization`/`?preview=` grant) stays
private. Nothing is inferred; cache behavior follows only the declared policy.
