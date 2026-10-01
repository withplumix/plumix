---
"plumix": minor
---

Changes what a meta-box field's `.default()` means: it is now the value a new entry, term or user starts with, written into its meta when it is created, instead of a fallback filled in on every read. A field an author clears now stays empty — before, the default came back on the next read and the next save wrote it. Search, `whereMeta` rule selectors and conditions now see a new entity's default, because it is stored.

**Breaking — types.** `.default()` no longer narrows the read type. `text("x").default("a")` reads as `string | undefined`. Chain `.required().default("a")` for a field that always reads a value.

**Breaking — existing content.** Entries, terms and users saved before this release lose field values they only showed because of the read-time fallback. To fill a default into them, run one statement per field against the table that holds it:

```sql
-- an entry field, scoped to the entry types it is registered on
UPDATE entries SET meta = json_set(meta, '$.difficulty', 'medium') WHERE type = 'recipe' AND json_type(meta, '$.difficulty') IS NULL;
-- a term field, scoped to its taxonomies
UPDATE terms SET meta = json_set(meta, '$.color', '#000000') WHERE taxonomy = 'category' AND json_type(meta, '$.color') IS NULL;
-- a user field (user fields apply to every user)
UPDATE users SET meta = json_set(meta, '$.newsletter', json('true')) WHERE json_type(meta, '$.newsletter') IS NULL;
```

**Breaking — settings.** A settings group reads its fields' defaults until its first save, which writes every field; after that, a cleared setting stays cleared. Before that save the settings form pre-fills those defaults, while themes reading through the `settings` template dep or `loadSettingsGroups` see only what is stored, as before. A group saved before this release has not had that first save yet: until its next save, a setting cleared in it reads its default again.

**Breaking — authenticators.** `RequestAuthenticator.authenticate` now receives a third argument, `{ startingUserMeta }` (`AuthenticateScope` in `plumix/auth`), and an authenticator that provisions users stores it as the new user's meta. `provisionUser`, `resolveExternalIdentity` and `verifyMagicLink` now require that meta. An authenticator that never creates users needs no change; code that calls `authenticate` itself passes `{ startingUserMeta: startingMeta(listUserMetaFields(ctx.plugins)) }`.

Adds `startingMeta(fields)` to `plumix/plugin`: the starting meta for a set of fields, for a plugin that inserts entries itself.
