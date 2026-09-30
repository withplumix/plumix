---
"@plumix/runtime-cloudflare": patch
---

Fixes `cfAccess` and the demo authenticator to declare their callers as `credential: "session"`, so a Cloudflare Access user can enrol a backup passkey.
