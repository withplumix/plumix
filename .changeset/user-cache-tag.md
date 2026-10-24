---
"plumix": minor
---

Purges only the cached pages that showed a user when that user changes. A page that resolves an author is now stored under that user's own cache tag, and every write to the user purges it: a profile save, a meta-only save such as a new avatar image, a locale change, a meta settle and a delete. A user write no longer purges every page of every public entry type.
