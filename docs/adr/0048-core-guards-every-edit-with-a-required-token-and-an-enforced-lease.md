# Core guards every edit with a required token and an enforced lease

Two people saving the same entry is the first problem a busy editorial CMS has
to solve, and Plumix has solved it twice without solving it.

On 2026-08-30 (#1561) we decided against presence UI and named "the stale-token
conflict dialog" as the collision signal. That dialog was never built for
editing. The admin's autosave classifies a stale-token `CONFLICT` as recovered,
refetches the entry's `updatedAt` and saves again, so the second editor's save
overwrites the first with nothing shown to either (#3018). The server check is
no better: `entry.update`, `entry.publish` and revision restore compare the
token with a row read earlier in the request, then run plugin filters and
reference queries, then update by id alone. The token itself is `updatedAt` at
one-second resolution, so two saves in the same second leave it unchanged.

The admin is also no longer the only writer we have to plan for. MCP agents,
REST clients, plugin code and, later, real-time collaboration will all write
the same rows. A rule that lives in the admin protects none of them.

Every mature CMS has met this. Contentful requires the resource version on every
update (`409 VersionMismatch`) and its SDKs send it for you. Sanity takes
`ifRevisionID`. Ghost requires `updated_at` on posts, and its forum shows what a
generic "someone else is editing" message costs when the someone was the user's
own stale tab. Drupal's `changed` check broke on saves within the same second.
WordPress added post locking with take-over in 3.6 because a warning was not
enough, and a user without the lock still overwrote the holder through the
autosave REST endpoint until the check moved into the server (Trac #55659).
Payload locks documents and globals by default. Settings are where most CMSs
stop: WordPress options, Drupal config, Strapi single types and Craft global
sets all keep the last write, and their users report the lost changes; Payload
is the exception, locking a global like a document. Detection catches a lost
update; a lock stops the work being done twice. The mature answer is both.

> **Core guards every resource a client edits from a copy: entries, terms,
> settings groups and users. A write made from a copy must carry the resource's
> token, and the write itself checks it, so a stale or missing token is refused
> whatever surface the write arrives on. A resource can be held by an edit
> lease; while it is live, anyone else's write is refused unless they take it
> over. A conflict says when the resource changed and who is editing it now.
> Nothing retries a conflict on the user's behalf.**

## What this means

- **The token is a change stamp each resource already stores, and no migration
  touches a table to get it.** `entries` and `users` use `updated_at`, in
  seconds as today. `terms` use the `version` column the menu already keeps.
  A settings group uses its marker row (below). SQLite cannot change a column's
  default or add one with a non-constant default in place, so drizzle rebuilds
  the table, and on D1 the rebuild's `DROP TABLE` cascades: `PRAGMA
foreign_keys=OFF` is ignored there, so rebuilding `entries` deletes every
  `entry_term` row and comment, and rebuilding `users` deletes every session
  and passkey (#3018 reproduced it with libSQL).
- **Clients see an opaque `etag` and send it back as `ifMatch`.** Every editable
  resource returns an `etag` when read, and every write from a copy takes it
  back as `ifMatch`, on every surface. RPC and MCP take `ifMatch` as a required
  field. REST sends `ETag` and requires `If-Match`, answering `428 Precondition
Required` when it is missing and `412 Precondition Failed` when it is stale,
  as HTTP defines them. Clients never parse an `etag`, so what it is made of can
  change without breaking one.
- **A guarded write is one plain conditional update, written with drizzle's
  typed builders.** `UPDATE … SET … WHERE id = ? AND updated_at = ? RETURNING
updated_at` (`version` for terms); no rows means a conflict. The update can
  only succeed while the row still holds `ifMatch`, so the next token is
  computed in TypeScript as the later of now and `ifMatch` plus one second
  (`ifMatch` plus one for a `version`), which keeps tokens strictly increasing
  at any write rate. JSON merges (meta, and RFC 7386 merge patches where `null`
  removes a key) are computed in TypeScript from the row read in
  the same request. No SQL functions, no `sql` templates and no casts, which
  also keeps clear of D1's restricted function list and its 100-parameter cap.
- **A settings group's token is its marker row.** Settings stay one row per key.
  The `__plumix_created` row every saved group already has carries the group's
  token as a counter in its `value`; a marker still holding `true` from before
  this reads as token zero. A save claims that row with the conditional
  update, then writes the changed keys, in one batch where the driver has one
  (D1, libSQL). A first save inserts the marker, and a second first save loses.
  An unsaved group's `etag` is zero.
- **Every write moves the token.** drizzle's `$onUpdate` stamps `updated_at` on
  any update that does not set it, as `max(unixepoch(), updated_at + 1)` rather
  than `unixepoch()`, so a write that skips the helpers still moves the token
  even within the same second, and an open copy conflicts rather than
  overwriting it. A write that sets `updated_at` itself, such as the revision
  upsert's `onConflictDoUpdate`, which `$onUpdate` does not reach, uses the
  same rule; so does any write to `terms.version` or a settings marker. Core's
  meta settle pins `updated_at` on purpose, because a settle is not an edit.
  Plugin bookkeeping (a view counter, a cache) lives in the plugin's own tables,
  never in a guarded row, so editors never meet a conflict nobody caused.
- **A draft save checks the token when read.** It writes only its author's own
  autosave row, never the shared entry, so no one else's work can be lost; the
  live write that publishes it claims the token.
- **System writes move the token without checking it.** Scheduled publishing,
  bulk actions, trash and restore, import and sync are not made from a copy.
  Restoring a revision is an edit, not a rewind: it sets a fresh token.
- **Every write answers with the new `etag`,** so a client chains saves without
  refetching. A token is required, never optional, because the caller always
  has one: it came with the copy.
- **A conflict carries the current `etag` and when it changed.** Who is editing
  comes from the edit lease, as it does in WordPress and Payload; no row records
  who wrote it last.
- **The pieces are shared, typed helpers, not a gatekeeper.** Core's resources
  and any plugin with an editable table of its own use the same helpers to read
  an `etag`, parse `ifMatch`, claim, merge and raise a conflict, and the same
  edit lease. A plugin table opts in by having `updated_at` or `version`.
- **An edit lease is held per user, renewed every 30 seconds while the editor is
  open, and lapses 120 seconds after the last renewal.** It records the user and
  the surface. The user's own tabs share it, and the token still catches a save
  from a stale one. A lease refusal is `LOCKED` over RPC and MCP, and `423
Locked` over REST, and names the holder. Taking over is always explicit
  (`takeOver: true`); the previous holder learns on their next renewal and turns
  read-only, keeping their unsaved work. An agent or API client that meets a
  lease stops and reports who holds it. System writes ignore leases.
- **The admin never hides a conflict.** It opens a resource read-only when
  another user holds it, offering to take over. On a conflict it pauses
  autosave, keeps the author's work and offers compare, keep mine (an explicit
  overwrite) or load theirs. The editor's own writes go through one queue that
  adopts each response's `etag`, so they never conflict with each other.
- **Collaboration extends this; it doesn't replace it.** When real-time editing
  arrives, the lease holder becomes the collaboration session: a second editor
  joins it rather than taking over, and the session persists through the same
  token-checked write.

## Considered options

- **Database transactions and row locks** (rejected). SQLite has no row locks
  and no `SELECT … FOR UPDATE`; its write lock covers the whole database. D1
  runs a transaction only as a `batch()` with no JavaScript between statements,
  and write hooks run between the read and the write. No database lock can span
  the minutes between an editor loading an entry and saving it.
- **`updated_at` in milliseconds** (rejected; this ADR's first form). It
  changes the column's default, which SQLite applies only by rebuilding the
  table, and on D1 the rebuild cascades into every table that references it.
  Seconds plus the strictly-increasing rule give the same guarantee without a
  migration.
- **A new `version` column on every resource** (rejected). `ALTER TABLE … ADD
COLUMN` with a constant default avoids the rebuild, but it is a column every
  write must keep in step, added only for this. `terms` keep the `version` they
  already have. The opaque `etag` lets core switch to one later.
- **A who-wrote-it column** (rejected). WordPress and Payload name the person
  through the lock, not the row, and the edit lease already records who holds
  it.
- **Settings reshaped to one row per group, or a separate table of group
  tokens** (rejected). Both change storage that works; the marker row every
  saved group already has carries the token.
- **The check and the merge in SQL** (rejected). `json_set` and a multi-row
  `INSERT … SELECT` need hand-written SQL and casts, and a long settings patch
  passes D1's 100-parameter cap. The `$onUpdate` fallback is the one exception:
  a single `max(unixepoch(), updated_at + 1)` with no parameters, built from
  the scalar functions D1 already runs in today's `$onUpdate`.
- **A field per resource such as `expectedLiveUpdatedAt`** (rejected). It names
  an implementation detail as the contract, and every resource grows its own
  spelling.
- **Detection only, as decided on 2026-08-30** (superseded). It tells the
  second editor after the work is done, and an agent writing over a human
  mid-edit with a fresh token is a case the token cannot catch.
- **Leases that API writers ignore by default** (rejected). Payload enforces
  locks in its REST and Local APIs but defaults `overrideLock` to `true`, and
  WordPress's editor-only lock was bypassed through REST. A lock only the UI
  respects is not a lock.
- **A lock per session** (rejected). It locks users out of their own second tab,
  which reads as a bug.
- **An optional token, defaulting to last write wins** (rejected). Every caller
  has the token from the copy it edits, so a forgotten token becomes a
  validation error rather than silent data loss.

## Consequences

- This supersedes the 2026-08-30 decision not to build presence. The edit lease
  is not the polled co-author badge #1561 rejected: it prevents lost work, and
  it is the seam collaboration grows from.
- Every open editor writes a renewal every 30 seconds.
- A settings save is two steps, claim then write. Two saves of the same card
  within the moment between them can interleave on keys both changed; a stale
  save, the case that loses work, is always refused by the claim.
- On D1 and libSQL a guarded save is two round trips, the read it merges from
  and the conditional write, as the update procedures already make today.
- Read replicas (D1 sessions, libSQL embedded replicas) cannot lose an update:
  the condition runs on the primary, so a stale replica read can only turn into
  a conflict.
- Entries adopt this first (#3018, then the lease in #3165); terms, settings
  groups, users and the media plugin follow in their own issues. Until then
  those resources are not protected, and this ADR, not their current code, is
  the rule.
- A row written more than once a second runs ahead of the clock by the excess:
  1,000 back-to-back saves put `updated_at` 1,000 seconds ahead on node:sqlite,
  bun:sqlite, libSQL and local D1 alike, and real time catches up once the
  writes slow. Nothing writes a guarded row that often (autosave is debounced at
  one second per group through one queue), so the visible cost is at most a
  `lastmod` or "updated" time a little in the future after a burst.
- No migration ships for any of this. The same benchmark shows the guarded
  write losing no update with four processes racing on one row, against
  thousands lost unguarded, for about 5 to 15% more time per write.
