---
"@plumix/blocks": minor
---

Flag island hydration mismatches in development.

In `plumix dev`, a hydrating island now mounts with React `hydrateRoot` instead
of `createRoot`, so a non-deterministic render — a `Date.now()`, `Math.random()`,
or locale read that differs between the Worker SSR pass and the browser — no
longer fails silently. React recovers by client-rendering the subtree (no crash)
and reports the divergence, which the renderer dispatches as a
`plumix:island-hydration-mismatch` event carrying the island element and React's
component stack. The dev island-error overlay renders it through the shared
dev-error page, named and labeled by the island's component, so the offending
island is flagged by name.

Production is unchanged, byte-for-byte: the `hydrateRoot` swap and the whole
diagnostic stay gated on `process.env.PLUMIX_DEV` and tree-shake out of
production island bundles, where every island keeps mounting with `createRoot`.
A `client="only"` island ships no server output, so it also keeps mounting fresh
with `createRoot` and is never reported as a mismatch.
