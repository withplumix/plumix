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
`ifRevisionID`. Ghost requires `updated_at`, and its forum shows what a generic
"someone else is editing" message costs when the someone was the user's own
stale tab. Drupal's `changed` check broke on saves within the same second, so
Commerce planned an explicit version field. WordPress added post locking with
take-over in 3.6, because a warning was not enough, and Payload locks documents
by default. Detection catches a lost update; a lock stops the work being done
twice in the first place. The mature answer is both.

> **Core owns concurrency for every resource a client edits from a copy:
> entries, terms, settings groups and users. Every write goes through core's
> write path, whatever surface it arrives on. A write made from a copy must
> carry the resource's token; core checks it in the same statement that writes,
> and a stale or missing token is refused. A resource can be held by an edit
> lease; while a lease is live, a write by anyone but its holder is refused
> unless they take it over. A conflict says who wrote, and when. Nothing retries
> a conflict on the user's behalf.**

## What this means

- **The token is `updatedAt`, and it strictly increases.** Every write sets it
  to the current time in milliseconds, or one millisecond past its previous
  value if that is later, so no two writes leave the same token at any write
  rate. There is no second concurrency concept beside it: the menu's
  `terms.version` folds into this rule when terms adopt it. A settings group is
  one resource, with one token.
- **The check is part of the write.** `UPDATE … WHERE id = ? AND updated_at =
?` is atomic on D1, Node and Bun without an interactive transaction, which D1
  cannot hold across JavaScript and SQLite would hold as a lock on the whole
  database. Zero rows changed is a conflict.
- **Every surface states the token in its own protocol.** RPC takes it as a
  required field (`expectedLiveUpdatedAt` for entries). REST sends an `ETag` and
  requires `If-Match` on writes, answering `428 Precondition Required` when it is
  missing and `412 Precondition Failed` when it is stale. An MCP write tool takes
  it as a required argument and answers a conflict with the current resource, so
  an agent re-reads, merges and retries. Plugin code passes it to core's write
  API, or says `overwrite: true` out loud: last write wins only when someone asks
  for it by name.
- **System writes move the token without checking it.** Scheduled publishing,
  bulk actions, trash and restore, import and sync are not made from a copy.
  They set `updatedAt` and `updatedBy`, so any copy open elsewhere conflicts on
  its next save. Restoring a revision is an edit, not a rewind: it sets a fresh
  token.
- **Every write answers with the new token,** so a client chains saves without
  refetching. A token is required, never optional, because the caller always
  has one: it came with the copy.
- **A conflict carries the current token, `updatedAt`, `updatedBy` and the
  lease holder.** `updatedBy` is the user, or the named system writer. When the
  writer was the same user, the message says so ("you, in another tab").
- **An edit lease is held per user, renewed every 30 seconds while the editor is
  open, and lapses 120 seconds after the last renewal.** It records the user,
  the client and the surface. The user's own tabs share it, and the token still
  catches a save from a stale one. Taking over is explicit; the previous holder
  learns on their next renewal and turns read-only, keeping their unsaved work.
  A lease refusal is `LOCKED` over RPC and MCP, and `423 Locked` over REST.
  System writes ignore leases.
- **The admin never hides a conflict.** It opens the entry read-only when
  another user holds it, offering to take over. On a conflict it pauses
  autosave, keeps the author's work and offers compare, keep mine (an explicit
  overwrite) or load theirs. The editor's own parallel writes go through one
  queue that adopts each response's token, so they never conflict with each
  other.
- **Collaboration extends this; it doesn't replace it.** When real-time editing
  arrives, the lease holder becomes the collaboration session: a second editor
  joins it rather than taking over, and the session persists through the same
  token-checked write.

## Considered options

- **Database transactions and row locks** (rejected). SQLite has no row locks
  and no `SELECT … FOR UPDATE`; its write lock covers the whole database. D1
  runs a transaction only as a `batch()` with no JavaScript between statements,
  and write hooks run between the read and the write. No database lock can span
  the minutes between an editor loading an entry and saving it, which is where
  the lost update happens.
- **A separate `version` counter** (rejected). It has no same-instant blind spot,
  but neither does a strictly increasing `updatedAt`, and a counter is a second
  concept for every reader of the row to learn. Contentful and Sanity carry
  both a version and a timestamp; Plumix already sends `updatedAt` everywhere
  and keeps one.
- **Detection only, as decided on 2026-08-30** (superseded). It tells the
  second editor after the work is done. WordPress added locking for that
  reason, Payload locks by default, and agents writing over a human mid-edit with a
  perfectly fresh token are a case the token cannot catch.
- **An advisory lock** (rejected). A lock that only warns does nothing against a
  writer with no UI to read the warning, which is every agent and API client.
- **A lock per session** (rejected). It locks users out of their own second tab,
  which reads as a bug.
- **An optional token, defaulting to last write wins** (rejected). Every caller
  has the token from the copy it edits, so requiring it costs nothing, and a
  forgotten token becomes a validation error rather than silent data loss.

## Consequences

- This supersedes the 2026-08-30 decision not to build presence. The edit lease
  is not the polled co-author badge #1561 rejected: it prevents lost work rather
  than decorating the editor, and it is the seam collaboration grows from.
- Every open editor writes a renewal every 30 seconds. On D1 that is a write
  per open editor per half-minute, which is the cost of not losing work.
- Entries adopt this first (#3018 for the token, a separate issue for the
  lease). Terms, settings groups and users adopt it in their own issues, and
  the menu's `version` column goes when terms do. Until then those resources
  are not protected, and this ADR, not their current code, is the rule.
- A REST or MCP write surface added later is incomplete without the token and
  the lease. Neither surface writes today.
- `updatedAt` can run up to a millisecond ahead of the clock per write in a
  burst. Nothing reads it more precisely than that.
