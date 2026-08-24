---
"@plumix/core": minor
"@plumix/plugin-menu": patch
---

Types the JSON columns and the meta write path with the public `JsonObject` / `JsonValue` types. `entries.meta`, `terms.meta`, `users.meta` and `auth_tokens.payload` now read as `JsonObject` instead of `Record<string, unknown>`, and a sanitized meta patch carries `JsonValue` values.

**Source-breaking for plugin authors** on the type level only — the emitted JS is unchanged. A read procedure hands its row back with meta already resolved by the field adapters, so the output filters for `entry.list`/`get`/`create`/`update`/`duplicate`, `term.list`/`get`/`create`/`update` and `user.get`/`update` now take `WithResolvedMeta<Entry | Term | User>` rather than the bare row; a filter annotated with the row type no longer assigns. `MetaPatch.upserts` is a `Map<string, JsonValue>`, and writing a `meta` column from a `Record<string, unknown>` needs the value proved first. `ResolvedMeta` and `WithResolvedMeta` are exported from `plumix`.

One behaviour change, in a path that could not previously succeed: a meta field whose `.sanitize()` callback returns `undefined` now leaves its key untouched instead of upserting `undefined`, which reached the driver as an unbindable `json_set` parameter.
