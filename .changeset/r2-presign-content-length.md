---
"@plumix/runtime-cloudflare": patch
---

Fixes presigned uploads from `r2()` accepting a body of any size. The URL is now signed for the exact `contentLength` it is asked for, so R2 refuses a PUT of any other length.
