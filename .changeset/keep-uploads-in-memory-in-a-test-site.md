---
"plumix": minor
---

Adds `site.storage` to the test site from `plumix/test`. A config that declares `storage` now gets an in-memory bucket, with `assertStored(key)` and `assertMissing(key)`, so an upload flow runs in a test with no temp folder. A config that declares `kv` gets an in-memory kv, and one that declares `imageDelivery` gets an image delivery that serves the stored original. `memoryStorage()` now answers the presigned PUT a browser sends to its upload URL, and a GET of a stored object, through its bucket's `fetch(request)`, and the test site serves those URLs. The object-storage conformance suite gains an upload case, run when an implementation passes `upload`.
