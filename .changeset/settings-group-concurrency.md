---
"plumix": minor
---

Fixes a settings save from a stale card overwriting another admin's save. `settings.get` and `settings.upsert` now answer `{ etag, values }` instead of the bare bag, and `settings.upsert` requires the `etag` back as `ifMatch`; a missing one is a validation error. A save from a copy the group has moved past is refused with `CONFLICT` reason `etag_mismatch`, carrying the group's current `etag` (no `updatedAt`: a group records no change time), and writes no key. A group never saved, or saved before this release, reads as `etag` `"0"` and saves from it without a conflict. No migration ships: the token lives in the row each saved group already has.

Settings groups also get edit leases: `settings.lease.acquire` (`takeOver` optional), `settings.lease.renew` and `settings.lease.release`, keyed by group name, and `settings.upsert` refuses a save while another admin holds the group's lease with `LOCKED`, unless it passes `takeOver: true`. In the admin, each settings card holds its group's lease while you work in it, shows who else is editing it with **Take over** and **Back**, and opens the conflict dialog (Compare, Keep mine, Load theirs) on that card instead of a generic error.

The `rpc:settings.get:output` and `rpc:settings.upsert:output` filters now receive and return `{ etag, values }`, exported from `plumix/schema` as `SettingsGroupCopy`. `ConflictError` from `plumix/db` also takes a version counter in place of a `Date`, for a resource whose token records no change time.
