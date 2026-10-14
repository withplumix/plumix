# A sync replaces a scope and never merges

A site had no Plumix command to move its data between environments (#2824).
It scripted `wrangler d1 export`, `d1 execute --file` and `r2 object put` by
hand, and got ordering, foreign keys and conflicts right itself. `plumix sync
pull` (deployed → local) and `plumix sync push` (local → deployed) replace
that. The PRD proposed merging a push on natural keys, and ran the transport
as a `RuntimeAdapter` member. This record supersedes it on those points.

> **A sync replaces whole tables, one named scope at a time, with the source's
> rows under their own ids, and never merges. Both ends must be at the same
> migration head for every owner. Each runtime moves the data through a
> `RuntimeSync` its commands module exports, and the work that follows a
> replace (`sync:after` listeners, then a purge of the whole CDN) runs inside
> the target site.**

## What this means

- **Replace, never merge.** A scope's tables are emptied on the target and
  refilled from the dump, in one direction. Rows match by primary key only to
  report what was replaced, added and removed.
- **Ids travel verbatim.** Content refers to rows by id inside JSON: a menu
  item's `meta.entryId`, a revision's slug `revision:<entryId>:…`. Renumbering
  would break every such reference, and no code can find them all.
- **Scopes are whole tables.** `content` is `terms`, `entries` (every entry
  type, so menu items, revisions and media rows too), `entry_term` and
  `settings`. `users` is `users` and `credentials`. `media` is every object in
  the `storage` slot, with the target's extra objects deleted. `plugin:<id>` is
  the tables a plugin's `schema` declares, ADR 0027's owner. No scope splits a
  table with a `WHERE`: a split leaves rows on the target that reference rows
  the replace removed.
- **Some scopes travel only together.** `users` needs `content`, because
  entries restrict the deletion of their authors. A plugin scope whose tables
  reference `content`'s needs `content`. The CLI refuses the pair before it
  opens anything.
- **Users are matched by email when `users` stays behind.** The dump carries
  `authors.ndjson`, the users its rows reference. Every foreign-key column into
  `users` is rewritten to the target user with the same email. An author the
  target lacks is added disabled, with the source's email, slug (suffixed when
  taken), name, avatar and role, so nobody can sign in as them until an admin
  enables them. The limit: a user id stored inside JSON rather than in a
  foreign-key column is not rewritten.
- **Dependents are removed and counted.** A row outside the sync that
  references a replaced row, through its own foreign key, is removed, or
  cleared where its key sets null. Comments on replaced entries go. The dry
  run counts them, so the operator sees the loss before it happens.
- **Auth state never travels.** `sessions`, `api_tokens`, `auth_tokens`,
  `device_codes` and `oauth_accounts` are in no scope and never in a dump. A
  `users` replace re-points each target session and API token to the imported
  user with the same email, so the token a remote settle authenticates with
  survives the push, and removes and counts the rest.
- **A push snapshots first.** The target takes a snapshot before the import and
  the CLI prints how to restore it. A pull only overwrites the local database
  and takes none.
- **Strict heads, checked on both sides.** The CLI compares every owner's
  newest applied migration on both ends before it exports, and the target's
  import compares the dump's heads with its own before it writes. A mismatch
  names the owner and the end that is behind, and says to run `plumix
migrate`.
- **The transport is a commands-module export.** `sync: RuntimeSync` sits next
  to `migrations` and `diagnose`; `RuntimeSync.open` returns a `SyncEnd` per
  end. The types live in core and are published on `plumix/cli`.
  `describeSyncContract` pins what every transport does, and `memorySync` is
  the reference that passes it.
- **Settling runs inside the target.** Core's `settleSync` runs every
  `sync:after` listener and then `cdn.purgeAll`, attempts each step whatever
  the others did, and reports every failure instead of throwing. A remote end
  reaches it through `POST /_plumix/api/v1/system/sync/settle`, which needs an
  API token whose user holds `settings:manage`.

## Considered options

- **Merge a push on natural keys** (entry type and slug, term taxonomy and
  slug). Plugin tables declare no natural key, and content JSON refers to rows
  by id, so a merge would leave those references pointing at other rows.
- **`content` and `media` split by `WHERE`** (media rows travelling with
  `media`). Rejected: `entry_term` links a media row to its terms, so the
  target kept links to rows the replace removed, or lost links it should keep.
- **`sync` as a `RuntimeAdapter` member.** The adapter ships in the server
  bundle, and a transport loads wrangler, the file system and remote APIs.
- **A generic `run(target, work)`** that hands the CLI a database to do the
  work itself. D1 is reachable from the CLI only through wrangler's own
  commands, so the work could not be written once for every runtime.
