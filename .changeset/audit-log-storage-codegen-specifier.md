---
"@plumix/plugin-audit-log": minor
---

Fixes a custom audit-log storage's tables never reaching `plumix migrate generate`. The plugin forwarded the storage's drizzle module to runtime queries but always named the default `@plumix/plugin-audit-log/schema` for codegen, so a storage with its own tables got no migration, and an external sink with none still emitted `audit_log`.

**Breaking:** `AuditLogStorage.schemaModule` is replaced by `schema?: { module, specifier }`, the drizzle module and the specifier codegen imports declared together: `schemaModule: mod` becomes `schema: { module: mod, specifier: "<package>/schema" }`. A storage with no tables omits it and contributes no table. A site whose custom storage left `schemaModule` unset already has `audit_log` from earlier generates, so its next `plumix migrate generate` drops that table: to keep the rows, declare `schema: { module, specifier: "@plumix/plugin-audit-log/schema" }`, and read the generated migration before applying it.
