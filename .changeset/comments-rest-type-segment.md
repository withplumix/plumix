---
"@plumix/plugin-comments": patch
---

Fixes the comments REST resource serving an entry's comments under any collection. `GET /_plumix/api/v1/{collection}/{entry}/comments` now answers 404 when the collection doesn't match the entry's type or names no public entry type, the same as `GET /{collection}/{id}`. An entry that isn't published or is closed to anonymous visitors now answers that same 404 instead of an empty page; an entry whose type has commenting off still gets an empty page.
