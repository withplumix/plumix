---
"@plumix/runtime-cloudflare": patch
---

Show the demo "Try the editor" CTA only to anonymous showcase visitors. It previously rendered for everyone, including inside the editor's own live preview and on the public site once a session existed. Adds `hasDemoSession(request)` (exported from `@plumix/runtime-cloudflare/demo`) so a theme can gate the CTA on the demo session cookie — `ctx.user` can't stand in, since core only resolves the public-render user for the default session cookie, not a custom authenticator's.
