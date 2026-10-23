---
"plumix": minor
---

Adds `authClient.useAccount()` and `authClient.account.update()`, so a theme's account page reads and saves the signed-in user's own name, avatar and meta with no RPC envelope or `ifMatch` of its own. A sign-in method may no longer take a name whose camelCase form is one of the auth client's own keys, such as `account` or `url`; declaring one fails at startup, naming the key.
