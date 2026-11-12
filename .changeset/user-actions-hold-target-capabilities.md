---
"@plumix/core": patch
---

Fixes editing, disabling, enabling, deleting and changing the email of another user who holds a capability you lack: each is now refused with `FORBIDDEN`, as assigning such a role already was. Acting on yourself is unchanged.
