---
"plumix": minor
---

Signs the upload size into presigned PUT URLs. `PresignPutOptions` replaces `maxBytes` with a required `contentLength`, the exact body size in bytes, and `presignPutUrl` from `plumix/storage/s3` takes the same field and signs it as `content-length`, so S3, R2 and MinIO refuse a PUT of any other length before storing it. `presignPutUrl` throws a `SigV4Error` with code `content_length_invalid` unless `contentLength` is a non-negative safe integer. `content-length` is not among the returned `headers`: the client's HTTP stack sets it from the body.
