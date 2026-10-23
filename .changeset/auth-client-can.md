---
"plumix": minor
---

Adds `authClient.can(capability)` and `authClient.useCan(capability)`, which check the signed-in user's capabilities to show or hide UI, and adds `capabilities` and `avatarUrl` to the session's `user`. The server render and hydration read the same session, so `useCan` never causes a hydration mismatch. The check is a hint only: the server still decides every write.
