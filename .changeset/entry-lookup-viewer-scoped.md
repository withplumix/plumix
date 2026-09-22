---
"plumix": minor
---

Scopes entry lookup to the viewer. `lookup.list` — the picker RPC, and the query behind reference-field validation and menu target resolution — now returns only the rows of each requested type the caller may see: a viewer holding `entry:<type>:read` gets the published rows plus the unpublished ones they may edit, and a viewer without it gets the published rows of a public type. Previously the caller's own `scope.entryTypes` was the only filter, so any signed-in principal could enumerate the id, title, slug and status of other authors' drafts.

Rejects a scope naming a reserved type. `revision` and `autosave` rows share the `entries` table with content, and an autosave holds another author's unsaved title; naming one in `scope.entryTypes` now throws a `LookupScopeError` instead of listing them.
