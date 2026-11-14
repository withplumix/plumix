---
"plumix": minor
---

Adds `mayServeFromSharedCache(app, request)` to `plumix/runtime`, which tells a runtime's gateway whether a shared cache may answer a request: a GET or HEAD with no session by the app's authenticator, no `Authorization` header, no `?preview` or `?plumix.edit`, and a path outside `/_plumix/`.
