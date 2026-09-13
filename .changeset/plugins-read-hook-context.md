---
"@plumix/plugin-comments": minor
"@plumix/plugin-audit-log": patch
"@plumix/plugin-media": patch
"@plumix/plugin-search": patch
"@plumix/plugin-seo": patch
---

Reads the request context from the lifecycle action a handler receives rather than from the ambient request store. `comment:created`, `comment:approved`, `comment:spam` and `comment:trashed` now hand their handlers the `AppContext` last as well, so code that fires them itself must pass it.

Fixes the audit log recording no actor for entry, term, user and settings changes made through an authenticated RPC: the ambient context is built before the request is signed in, so the listener now attributes each row to the user the procedure ran as.
