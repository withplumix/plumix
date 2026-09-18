---
"@plumix/core": minor
---

Fixes a `type: "boolean"` meta field reading differently depending on which bag a consumer holds. The decode no longer widens a stored `1`, `"1"` or `"true"` to `true`, so it agrees with the three readers that cannot decode — a `WHERE` over the JSON column, a raw row off a lifecycle event, and `storedMeta` behind `whereMeta`. In plugin-seo this split one page's indexability across its head, the sitemap and IndexNow.

Writes are unchanged: those tokens are still accepted and still stored as a real boolean, so only a row that bypassed the pipeline can hold one — a legacy `type: "json"` row, an import, or a direct write. Such a value stays as stored until someone edits that field.

Upgrade note: on those rows the value now reaches a theme or plugin as the raw token while its read type still says `boolean`. Read a boolean meta field with `=== true` rather than truthiness, since a stored `"false"` is a non-empty string.
