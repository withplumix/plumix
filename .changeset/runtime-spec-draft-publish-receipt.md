---
"plumix": patch
---

Fixes `runtimeSpec` from `plumix/test/playwright` failing intermittently on a fast runtime: after publishing, it now waits for the editor's draft Publish button, which the header settles on once the refetched entry reads published, instead of the first button, which unmounts as soon as the refetch lands.
