# The auth client manages the signed-in user's own account

A theme's account page has to do what the admin's own profile screen does:
rename the user, change the email, pick a locale, see and revoke sessions,
manage passkeys. The server already lets a subscriber do each of these on
themselves (`user:edit_own`, and the `auth.sessions` and `auth.credentials`
procedures scoped to the session's user). The auth client in
`plumix/auth/client` stops at sign-in, sign-out and the session, so a theme
posts raw RPC envelopes. That broke without a type error when `user.update`
began requiring `ifMatch` (ADR 0048, #3204): one theme now reads
`users.updatedAt` in a block loader and applies `etagOf` itself, copying core's
concurrency logic into theme code (#3227).

Better Auth, which the auth client took its `{ data, error }` shape from, ships
`updateUser`, `changeEmail`, `listSessions`, `revokeSession`, `listAccounts`
and `unlinkAccount` as plain promises. Its only hooks are the session and a few
lists a plugin chooses to wrap, and those refresh by matching request paths
after any call. Its tracker keeps reporting the matchers drifting from the
endpoints that change the data (#858, #8807, #9710, #1006, and #8910 asking to
replace them). WordPress never decides permission for a record on the client:
`map_meta_cap` runs on the server, themes get a rendered yes or no
(`get_edit_post_link`), and the block editor reads what the server attaches to
each record (`Allow`, `targetHints`). WordPress has no edit lock on user
profiles at all.

> **The auth client covers the signed-in user's own account: profile, email
> change, locale, sessions, passkeys, linked OAuth accounts and a capability
> check. Each call acts on the session's user, never an id, and resolves
> `{ data, error }`. Shared state is a hook (`useSession`, `useAccount`,
> `useCan`), every list is a promise, and a call that changes shared state
> refreshes it itself. `can` is a hint for showing or hiding UI; the server
> decides every write.**

## What this means

- **Grouped by subject, under reserved names.** The kernel's own keys are
  `account`, `sessions`, `can`, `useAccount` and `useCan`, beside the existing
  `signIn`, `signOut`, `useSession`, `useAuthMethods` and `url`. No sign-in
  method may declare a kernel key as its name or as its name's camelCase form,
  and one that does fails at boot, so a method is never shadowed silently. Managing a method's own credentials belongs to that
  method's client half: `authClient.passkey.list/rename/remove` beside
  `passkey.register`, and `authClient.oauth.accounts/unlink`.
- **The account holds its own token.** `useAccount()` loads the user's own
  profile and its `etag` on first use, not in every render, and
  `account.update` sends that `etag` and keeps the one each save returns. A
  theme never sees a concurrency token. A stale copy comes back as a typed
  `etag_mismatch` after the account has reloaded, so the next save works, and
  the theme still holds the patch it sent.
- **A user's own save takes over the edit lease.** `account.update` asks to
  take over, so an admin who has the user open never blocks the account's owner.
  The admin learns it on their next renewal and turns read-only, as ADR 0048
  describes, and the token still refuses whichever save comes from a stale
  copy. This is the one place a take-over is made for the caller rather than
  by them: the owner of the data always wins over their own profile, and
  WordPress has no lock here at all.
- **`can` checks capabilities, not records.** The session carries the user's
  capabilities, and `can(capability)` / `useCan(capability)` read them.
  Whether a user may edit _this_ entry depends on its author, status and any
  policy, so the theme decides it on the server with `ctx.auth.can` and passes
  the answer down. The client never re-implements the own-or-any rule.
- **Lists are promises; refreshes are explicit.** `sessions.list`,
  `passkey.list` and `oauth.accounts` return `{ data, error }` and keep no
  cache. A call that changes shared state refreshes that store in its own
  body: `account.update` refreshes the session's name, sign-out clears the
  account. Nothing matches request paths.
- **No new self-service server surface, except one.** Every call wraps a
  procedure the admin's profile screen already uses. Listing and unlinking
  linked OAuth accounts is new, and unlinking refuses to remove the user's last
  way to sign in.

## Considered options

- **Flat methods, like Better Auth** (`authClient.updateUser`,
  `authClient.listSessions`). Rejected: the client sends every key it does not
  own to a sign-in method's namespace, so flat names compete with method names.
- **The caller passes the `etag`.** Rejected: it puts ADR 0048's token back in
  theme code, which is the breakage this decision removes.
- **The profile and its `etag` in every server render, as the session is.**
  Rejected: every signed-in page would carry it, though few pages edit it.
- **A `locked` error when someone else holds the lease.** Rejected: it lets an
  admin's open tab block a member from their own profile, which no CMS we
  surveyed does.
- **`can(capability, { authorId })` resolving own-or-any on the client.**
  Rejected: it copies the server's rule into the client, where it drifts once
  status or policy matters. WordPress avoids it for that reason.
- **A hook per list, refreshed by path matchers.** Rejected for the drift
  Better Auth's tracker shows.
- **API tokens and deleting one's own account.** Left out: tokens are an
  operator's concern, and erasing a person is the site admin's job
  ([`VISION.md`](../../VISION.md#the-floor)), which decides who inherits their
  content.

## Consequences

- A theme builds an account page from `plumix/auth/client` alone, with no
  `/_plumix/rpc/*` path and no `plumix/db`.
- `account`, `sessions`, `can`, `useAccount`, `useCan`, `signIn`, `signOut`,
  `useSession`, `useAuthMethods` and `url` become names a sign-in method cannot
  take.
- Two tabs on one account each hold an `etag`; the second to save gets
  `etag_mismatch` and the reloaded profile.
- A theme that shows a list again after a change calls it again. A shared
  cache can come later without changing any signature.
- A runtime that refuses an area (ADR 0014: `passkeys`, `oauthLinking`) answers
  those calls with a typed error, as it refuses the routes behind them.
- #3227 lands in slices: the account namespace and reserved names with
  profile, then email change, locale, sessions, passkeys, the capability check,
  and linked OAuth accounts last.
