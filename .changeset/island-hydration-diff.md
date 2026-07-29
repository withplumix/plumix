---
"@plumix/blocks": minor
---

Show _what_ diverged on an island hydration mismatch, not just that it did.

When a dev-hydrating island's server and client renders disagree, the renderer
now captures the island's own HTML at two points — before `hydrateRoot` (the
server render) and after React's recovery re-render (the client render) — and
carries both on the `plumix:island-hydration-mismatch` signal. The shared
resolved-error contract (`DevErrorInfo`) gains one optional `hydrationDiff`
field for that server/client pair, and the dev-error page renders a
server-vs-client diff section when it is present — leading, above the raw
component stack — so the developer sees the exact markup that changed. Both
captured strings render as escaped text, never re-parsed.

Surfaces that do not set the field are unchanged: an SSR error, an island
component throw, or a mismatch with no captured pair renders exactly as before.
Production stays untouched — the capture lives inside the existing
`process.env.PLUMIX_DEV` branch and tree-shakes out.
