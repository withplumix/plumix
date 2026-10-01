---
"plumix": minor
---

Changes what a meta-box field's `.default()` means: it is now the value a new entry, term or user starts with, written into its meta when it is created, instead of a fallback filled in on every read. A field an author clears now stays empty — before, the default came back on the next read and the next save wrote it. Search, `whereMeta` rule selectors and conditions now see a new entity's default, because it is stored.

**Breaking — types.** `.default()` no longer narrows the read type. `text("x").default("a")` reads as `string | undefined`. Chain `.required().default("a")` for a field that always reads a value.

**Breaking — existing content.** Entries, terms and users saved before this release lose field values they only showed because of the read-time fallback. To fill a default into them, run one statement per field, for example:

```sql
UPDATE entries SET meta = json_set(meta, '$.difficulty', 'medium') WHERE type = 'recipe' AND json_type(meta, '$.difficulty') IS NULL;
```

Terms and users take the same statement against `terms` and `users`.

A settings group reads its fields' defaults until its first save, which writes every field; after that, a cleared setting stays cleared. A settings group saved before this release has not had that first save yet: until its next save, a setting cleared in it reads its default again, and saving the form stores that default — clear it again after that save to keep it empty. Adds `startingMeta(fields)` to `plumix/plugin`, the starting meta for a set of fields. A `RequestAuthenticator` now receives a third `scope` argument carrying the plugin registry (`AuthenticateScope` in `plumix/auth`), so one that provisions users can give them their starting meta.
