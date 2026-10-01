---
"plumix": patch
---

Fixes `TestResponse.assertTemplate` in `plumix/test`, which threw on every call. It now asserts the template rule the request resolved to.
