---
"@plumix/core": patch
---

Fixes an OAuth sign-in finishing in a browser other than the one that started it: `/start` now sets a short-lived `plumix_oauth_state` cookie, and the callback signs in only a browser that holds it. A sign-in left open across a deploy has to start again.
