---
"@plumix/runtime-bun": patch
---

Fixes presigned uploads from `bunS3()` accepting a body of any size. The URL is now signed for the exact `contentLength` it is asked for, so the bucket refuses a PUT of any other length.
