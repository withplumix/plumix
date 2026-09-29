---
"plumix": minor
---

Adds `fakeS3` to `plumix/test/conformance`: an in-memory S3 bucket that verifies SigV4 on every request, for running an S3-backed storage slot through `describeObjectStorageContract`. Serve its `fetch` on a listener to test a client that does not go through the global `fetch`.
