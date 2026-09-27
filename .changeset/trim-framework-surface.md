---
"plumix": minor
---

Removes `excludeFromGenericRpc` from `registerEntryType` and `registerTermTaxonomy`, and from `RegisteredEntryType` / `RegisteredTermTaxonomy`. Nothing ever read it, so setting it changed no behaviour; delete the option from your call. `excludeFromSearch` is unchanged. Also removes `resolveIslandChunkUrl` and `assemblePluginAdminBundle` from `plumix/vite`, which only the `plumix()` Vite plugin itself uses, and gives `create-plumix-app` an exports map, so its `dist/` modules can no longer be deep-imported. Its `create-plumix-app` command is unchanged.
