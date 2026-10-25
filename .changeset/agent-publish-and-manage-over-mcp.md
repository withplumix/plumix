---
"plumix": minor
---

Adds MCP tools so an agent does the rest of an editor's job: `content_publish`, `content_discard_draft`, `content_duplicate`, `content_trash`, `content_restore`, `revision_list`, `revision_restore`, `term_create` and `term_update`. They run under the same rules as the admin: publishing needs the publish capability, `ifMatch` and edit leases apply, and only `content_trash` is marked destructive. Nothing deletes permanently over MCP. `term_get` now returns the term's `etag`.
