---
"plumix": minor
---

Names the values `plumix/db`, `plumix/db/libsql`, `plumix/schema`, `plumix/fields`, `plumix/storage/s3`, `plumix/cdn/cloudflare`, `plumix/test`, `plumix/test/conformance`, `plumix/test/playwright` and `plumix/blocks/island-renderer` publish, instead of republishing every value their internal package exports. Types are unchanged. `plumix/admin/ui` stays a whole passthrough over the shadcn set.

Removes these values from the published surface:

- `plumix/db`: the drizzle-valibot row schemas — `allowedDomainInsertSchema`, `allowedDomainSelectSchema`, `apiTokenInsertSchema`, `apiTokenSelectSchema`, `authTokenInsertSchema`, `authTokenSelectSchema`, `credentialInsertSchema`, `credentialSelectSchema`, `deviceCodeInsertSchema`, `deviceCodeSelectSchema`, `entryInsertSchema`, `entrySelectSchema`, `entryTermInsertSchema`, `entryTermSelectSchema`, `oauthAccountInsertSchema`, `oauthAccountSelectSchema`, `sessionInsertSchema`, `sessionSelectSchema`, `settingInsertSchema`, `settingSelectSchema`, `termInsertSchema`, `termSelectSchema`, `userInsertSchema`, `userSelectSchema`. Import them from `plumix/schema`, which keeps them and every table.
- `plumix/db`: drizzle's Postgres-only operators — `arrayContained`, `arrayContains`, `arrayOverlaps`, `ilike`, `notIlike`, `cosineDistance`, `hammingDistance`, `innerProduct`, `jaccardDistance`, `l1Distance`, `l2Distance` — and its SQL-builder internals — `FakePrimitiveParam`, `Name`, `Param`, `Placeholder`, `StringChunk`, `View`, `bindIfParam`, `fillPlaceholders`, `getViewName`, `isDriverValueEncoder`, `isSQLWrapper`, `isView`, `name`, `noopDecoder`, `noopEncoder`, `noopMapper`, `param`, `placeholder`.
- `plumix/test`: `createRequestMemo`.
- `plumix/test/playwright`: `resolveE2EPort`, `buildAdminPluginChunkForE2E`.
- `plumix/blocks/island-runtime`: `bootstrapIslandRuntime`. Importing the subpath still boots the islands runtime.

To upgrade, use `sql.placeholder`, `sql.param` and `sql.identifier` in place of `placeholder`, `param` and `name`, and build a test context with `createTestContext` rather than pairing a stand-in with `createRequestMemo`.
