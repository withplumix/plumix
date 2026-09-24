---
"plumix": minor
---

Adds `publicEntryRows` to `plumix/db`, the rule every archive's entry query starts from, for a surface that compiles an archive's query outside core's listing reader. Adds `ListingArchiveTypeOptions` and `UnlistedArchiveTypeOptions` as augmentation targets on `plumix`, so a plugin can add an archive option only an archive with `entries` accepts.
