---
"plumix": minor
---

Resolves a plugin's relative `schemaModule` and `dataMigrations` from the folder holding `plumix.config.ts`, the folder the config's own `dataMigrations` resolves from, and fails with `migrate_schema_module_unresolved` or `migrate_data_module_unresolved`, naming the file it looked for, when the path names no file. `generateSchemaSource` from `plumix/test` now takes the site root as its second argument.

**Breaking:** a plugin in the site's own folder drops the leading `../` from its `schemaModule` and `dataMigrations`: `"../src/plugins/bookmarks/schema.ts"` becomes `"./src/plugins/bookmarks/schema.ts"`.
