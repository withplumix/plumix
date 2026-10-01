---
"@plumix/plugin-media": patch
---

Fixes presigned media uploads not being bounded by `maxUploadSize`. `media.createUploadUrl` now has the URL signed for exactly the declared `size`, which it has already checked against `maxUploadSize`, so the bucket refuses a PUT of any other length instead of storing it until `media.confirm` deletes it.
