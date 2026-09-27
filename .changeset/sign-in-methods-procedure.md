---
"plumix": minor
---

Fixes the admin login and the user email field offering magic-link flows on a site without `auth.magicLink`: the login screen now shows **Email me a link** only when magic link is configured, and the email field shows the address read-only with an explanation instead of a **Change email** button. Replaces the public `auth.oauthProviders` procedure with `auth.signInMethods`, which returns `{ magicLink, oauth }` — read `.oauth` where you read the provider list before. Removes `ctx.oauthProviders` from the app context (read `ctx.authMethods.oauth`), and renames the `oauthProviders` field of `useAuthMethods()` to `oauth`. `createRpcHarness` takes an `auth` config in place of its `oauthProviders` option.
