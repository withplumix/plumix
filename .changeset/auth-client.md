---
"plumix": minor
"create-plumix-app": minor
---

Adds `authClient` on `plumix/auth/client`, for a theme's own sign-in page: `authClient.signIn.passkey()`, `.magicLink()`, `.oauth(provider)` and each plugin method's `signIn` resolve `{ data, error }`, `signOut()` and `url()` carry the base path, and `useSession()` and `useAuthMethods()` read the server render. A plugin's `defineAuthMethod` names its browser half with `client`, written with `defineAuthMethodClient`. `plumix()` and `auth()` keep their OAuth provider keys, and a new `plumix.config.ts` declares `OAuthProviderRegistry` from them so `signIn.oauth` only takes a configured provider. Removes `useAuthMethods` from `plumix/blocks/renderer`; use `authClient.useAuthMethods()`.
