---
"@plumix/blocks": patch
"@plumix/core": patch
---

Narrows the two user-meta bags on the public surface to `JsonObject`, and gives the framework's
remaining open dictionaries names.

`AuthenticatedUser.meta` and its `@plumix/blocks` mirror `RendererUser.meta` were
`Record<string, unknown>`. Both are the `users.meta` column read straight off the row, and that
column has been `JsonObject` since the storage migration — the projection just never followed. A
custom `RequestAuthenticator` that builds an `AuthenticatedUser` from a bag typed
`Record<string, unknown>` now has to say `JsonObject`; reading `ctx.user.meta` is unaffected.

Everything else here is a rename. The bags that are genuinely not serialized data — logger metadata,
a settings group, a drizzle schema module, the Vite config passthrough, a template's resolved deps,
island props, the block context's entry and site settings — are now named types (`LogMeta`,
`SettingsBag`, `SchemaModule`, `ViteUserConfig`, `LoadedTemplateDeps`, `SerializedProps`,
`HydratedEntry`, `SiteSettings`, and others), each declared once with a note saying what puts a
non-serializable value in it. The types they alias are unchanged, so existing annotations keep
compiling.

This is the contract step of the JSON dictionary migration: a new `plumix/no-unsafe-dictionary` lint
rule now rejects `Record<string, unknown>` written inline, so "JSON nobody has parsed" and "a bag
that is open by design" can no longer share a spelling.
