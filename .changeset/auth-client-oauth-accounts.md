---
"plumix": minor
---

Adds `authClient.oauth.accounts()` and `authClient.oauth.unlink(provider)`, which list and unlink the signed-in user's linked OAuth accounts. `unlink` resolves `last_sign_in_method` and keeps the link when it is the user's last way to sign in, and unlinking fires the `oauth_account:unlinked` action. A runtime that refuses the `oauthLinking` area resolves `forbidden`.
