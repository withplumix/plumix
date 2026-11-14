---
"@plumix/plugin-comments": patch
---

Reads the signed-in commenter from `ctx.user` instead of calling the site's authenticator, now that core resolves a public plugin route's principal. A JavaScript submit still carries the author, and a plain form post still submits anonymously. A submit carrying only an API token, with no session cookie, now posts anonymously.
