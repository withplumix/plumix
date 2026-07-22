---
"@plumix/plugin-menu": patch
---

Menu resolution is now batched across locations: the `menus` template dep resolves every declared slug through a new `getMenusByName` with a query count flat in the number of menus — one term lookup, one item read, and one ref-resolution pass shared across all of them — instead of ~5 queries per location on every public render. `getMenuByName` keeps its signature as a single-slug wrapper over the same path.
