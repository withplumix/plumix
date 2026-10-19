---
"@plumix/plugin-media": patch
---

Fixes an alt text or title save in the media library overwriting a newer change made elsewhere. `media.list`, the `media_list` and `media_get` MCP tools, and `media.update` now return each item's `etag`, and `media.update` requires it back as `ifMatch`: a save from an out-of-date copy is refused with `CONFLICT` reason `etag_mismatch`, and a save while another user holds the item's edit lease is refused with `LOCKED`. The library's detail panel holds the item's edit lease while it is open, turns read-only with a "{name} is editing this media item" notice and a Take over button while someone else has it, and on a stale save opens the admin's conflict dialog to compare, keep yours or load theirs.
