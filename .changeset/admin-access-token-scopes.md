---
"plumix": patch
---

Fixes the admin and the admin bar ignoring a token's scopes. A caller signed in with an API token whose scopes leave out `admin:access` is now sent to `/` and sees no admin bar, even when their role holds it.
