---
"plumix": minor
---

Fixes a concurrent entry save overwriting another editor's write. Every entry read and write now answers with an opaque `etag`, and `entry.update`, `entry.publish` and `entry.revisions.restore` require it back as `ifMatch`, replacing `expectedLiveUpdatedAt` (removed, with no alias). The save itself checks the token, so a write that lands mid-save or in the same second is refused with `CONFLICT` reason `etag_mismatch` (was `stale_expected_updated_at`), carrying the entry's current `etag` and `updatedAt`. A missing `ifMatch` is a validation error.

The editor no longer retries a conflicting save behind the author's back: autosave pauses, the author's changes are kept, and a dialog says when the entry changed and offers Compare, Keep mine and Load theirs.

`plumix/db` adds the helpers a plugin's own editable table can use for the same guarded write: `etagOf`, `parseIfMatch`, `nextToken`, `claim`, `mergePatch`, `ConflictError` and `ifMatchObject`.
