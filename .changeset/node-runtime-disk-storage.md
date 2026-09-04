---
"@plumix/runtime-node": minor
---

Adds `diskStorage({ dir })`, the object-storage slot on the filesystem: one file per key under `dir/objects/` with its content type and metadata beside it under `dir/meta/`, a traversal guard that refuses a key before touching disk, ranged reads, and a listing by prefix whose cursor is the last key served. `url()` is null, so the media plugin serves uploads through its own route. Single-node by design; `s3()` from `plumix/storage/s3` is the swap.
