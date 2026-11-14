---
"@plumix/core": patch
---

Requires a signed-in session to invite a user. `user.invite` now answers `UNAUTHORIZED` to an API token, as creating an API token or approving a device already does.
