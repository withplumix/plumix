---
"@plumix/plugin-audit-log": minor
---

Fixes `ctx.audit.log()` recording nothing from an authenticated RPC procedure or route. The extension read the signed-in user off the request's ambient context, which is built before authentication; the procedure's own context, the one carrying the user, never reached it, so every row was dropped.

**Breaking:** `log()` now takes the caller's context first — `ctx.audit?.log(ctx, { event, subject })` — and that context must be an `AuthenticatedAppContext`, which an authenticated procedure or route already holds. A hook listener gets a plain `AppContext`, so it checks `ctx.user` and passes `{ ...ctx, user: ctx.user }`. The runtime debug-and-drop for a missing user is gone; the compiler rejects the call instead.
