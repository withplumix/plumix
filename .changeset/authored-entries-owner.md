---
"plumix": minor
---

Adds `loadAuthoredEntry` to `plumix/db`: it loads an entry by id and answers `undefined` for a revision or autosave row as it does for a missing id, so a plugin taking an id from a visitor cannot reach editor history. Core's own procedures now load through the same path. A revision or autosave id now answers `NOT_FOUND` everywhere: `entry.trash`, `entry.restore`, `entry.deletePermanent` and their bulk forms answered `FORBIDDEN`, and `entry.activity.list` and `entry.revisions.list` answered `BAD_REQUEST` with `reserved_type`.
