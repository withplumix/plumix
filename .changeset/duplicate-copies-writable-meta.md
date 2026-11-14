---
"@plumix/core": patch
---

Fixes `entry.duplicate` copying meta the caller could not set themselves. The copy now carries only the source's meta that a registered field owns and the caller may write, checked the way `entry.create` checks it. A key no field registers, such as a plugin's own record of the entry, stays with the source.
