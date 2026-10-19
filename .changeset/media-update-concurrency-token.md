---
"@plumix/plugin-media": patch
---

Fixes an alt text or title save in the media library overwriting a newer change made elsewhere. `media.list`, the `media_list` and `media_get` MCP tools, and `media.update` now return each item's `etag`, and `media.update` requires it back as `ifMatch`: a save from an out-of-date copy is refused with `CONFLICT` reason `etag_mismatch`, and a save while another user holds the item's edit lease is refused with `LOCKED`. The media library sends the token, chains each save from the last one's answer, and on a conflict says the item changed elsewhere and shows its latest version.
