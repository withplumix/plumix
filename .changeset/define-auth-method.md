---
"plumix": minor
---

Adds `defineAuthMethod` to `plumix/plugin`, so a plugin can declare a sign-in method in its descriptor's new `authMethods` field. Its routes answer under `/_plumix/auth/<name>/`, and each handler gets a kernel that reads the request, proves an identity with the site's sign-up rules, mints the session and answers in the caller's transport: JSON for a fetch, a `302` for a navigation, a `303` for a plain form post. Core's passkey, invite, magic link and OAuth are declared the same way. Boot fails for a method name that isn't a kebab-case slug, is declared twice, or is one of core's own auth routes (`device`, `signout`, `verify-email`). Also exports the types `AuthMethodDefinition`, `AuthMethodRoute`, `AuthMethodKernel`, `IdentityProof` and `IdentityRefusalCode`.

Breaking and behaviour changes:

- An unsafe `redirectTo` now lands on the site root instead of the admin after a magic-link or OAuth sign-in, and the emailed link and the OAuth state carry the validated value. A `redirectTo` outside the base path, or with a `.` or `..` segment, counts as unsafe.
- Passkey login verify, passkey register verify and invite verify answer `{ userId, redirectTo }` instead of `{ userId }`.
- Passkey login for a disabled account answers `403 { error: "account_disabled" }` instead of a `200` with a cookie the next request rejects.
- A sign-in whose user row is gone answers `link_broken`: a magic link answered `token_invalid`, and a passkey signed in.
- A malformed OAuth provider key answers `oauth_error=provider_not_configured` on GET and `405` on POST, instead of `404`.
- The magic-link request and sign-out accept same-origin form posts, landing on `loginPath?magic_link_sent=1` and `loginPath?signed_out=1`, and sign-out takes `?redirectTo=`.
- Identity refusals log `sign_in_refused` instead of `magic_link_verify_rejected` or `oauth_callback_rejected`.
- `useAuthMethods()` and the `auth.signInMethods` procedure return `{ methods: { name, label }[], oauth }`: read `methods.some((m) => m.name === "magic-link")` where you read `magicLink`. The `passkey` and `magicLink` booleans are gone.
- `user:signed_in`'s `method` widens to `string`: a sign-in method's key, or `"external"`.
- `resolveExternalIdentity` takes an optional `providerAccount` and refuses a broken link with the new `link_broken` code.
