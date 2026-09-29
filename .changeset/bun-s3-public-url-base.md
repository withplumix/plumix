---
"@plumix/runtime-bun": minor
---

Adds `publicUrlBase` to `bunS3`. When set, an object's URL is `<publicUrlBase>/<key>`, encoded as `s3()` and R2 encode it, so media is served from the CDN or custom domain in front of the bucket instead of through the Bun process. Without it, `url()` still returns `null` and the media plugin proxies objects as before.
