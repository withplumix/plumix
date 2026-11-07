---
"@plumix/core": minor
---

Adds a Connected apps section to the profile's API tokens card. It lists each OAuth client a person approved, with its access and when it was last used, and revoking one disconnects it at once and makes its next connection ask for consent again. An admin with `user:manage_tokens` can list and revoke another user's connected apps.
