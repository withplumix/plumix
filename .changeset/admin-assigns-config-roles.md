---
"plumix": minor
---

Adds the config's roles to the admin's users screens: the role filter, invite and edit pickers list each declared role by its label, and a user whose stored role the config no longer declares shows as "Unknown role". Assigning a role, by invite or by edit, is refused when it grants a capability the actor doesn't hold.
