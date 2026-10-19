---
"plumix": minor
---

Fixes a profile save from a stale copy overwriting a newer write to the user. `user.get`, `user.list`, `user.update`, `user.disable` and `user.enable` now answer with an opaque `etag`, and `user.update` requires it back as `ifMatch` (a missing one is a validation error). The save itself checks the token, so a write that lands mid-save or in the same second is refused with `CONFLICT` reason `etag_mismatch`, carrying the user's current `etag`, `updatedAt` and, when someone holds it, the edit lease `holder`. Disabling, enabling, an email change and `user.setLocale` move the token, so a copy opened before them conflicts too.

Users get edit leases: the new `user.lease.acquire` (`takeOver` optional), `user.lease.renew` and `user.lease.release` procedures drive them, and `user.update` refuses a save from anyone but the holder with `LOCKED` (HTTP 423) unless it passes `takeOver: true`. The user editor holds the lease while it is open, turns read-only with a "{name} is editing this profile" banner offering Back and Take over, and on a conflict shows the dialog with Compare, Keep mine and Load theirs instead of saving over the other write.
