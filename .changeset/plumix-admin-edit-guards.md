---
"plumix": minor
---

Adds `useEditLease`, `EditLeaseBanner` and `EditConflictDialog` to `plumix/admin`, so a plugin screen that edits an entry, term or user holds its edit lease, shows who else is editing it and resolves a stale save the way the admin's own editors do. They are the admin shell's own instances, with its strings. `editingElsewhere` and the `EditingCopy`, `EditLease`, `EditLeaseKind`, `EditLeaseBannerProps`, `EditConflictDialogProps` and `AdminEditing` types are exported beside them.
