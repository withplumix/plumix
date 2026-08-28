---
"@plumix/core": minor
"plumix": minor
"@plumix/plugin-comments": patch
"@plumix/plugin-forms": patch
---

Adds `readVisitorMeta` to `plumix/db`: a request in, a salted per-install hash of the visitor's
address and their truncated user-agent out. It is what a public submission handler needs to
rate-limit or attribute without keeping the address itself, and `@plumix/plugin-comments` and
`@plumix/plugin-forms` had each grown their own copy of it — the same hex encoder, the same lazily
minted settings-row salt, the same `cf-connecting-ip` → `x-forwarded-for` → `"unknown"` ladder.

The salt is minted on first use and persisted in the settings table, so an install needs no env var
or KV binding to store hashed addresses; concurrent first-writes converge on one salt through
`onConflictDoNothing` and a re-read. It takes the caller's namespace and keeps that namespace's salt
in its own group, so no two callers share one — either's hashes would otherwise be matchable against
the other's.

To be clear about what the salt buys: it defeats a precomputed table of the IPv4 space and nothing
more. It lives in the same database as the hashes, so it is no defence against someone who has
already read that database.

Also closes the hole that made keeping the salt off a settings _page_ meaningless. `settings.get`
took any group name it was handed, so both plugins' salts were readable by anyone holding
`settings:manage` — which is admin-wide, and mintable as a narrow API-token scope that has no
business seeing them. A settings group whose name ends in `_internal` now means server-only rows:
`settings.get` and `settings.upsert` refuse it, and `registerSettingsGroup` rejects the name at boot
rather than letting a plugin build a settings page that fails on every load. Server-side readers are
unchanged — this defends against a `settings:manage` holder, not against code running in the worker.
