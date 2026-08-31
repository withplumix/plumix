---
"@plumix/plugin-search": minor
---

Adds `@plumix/plugin-search`, which keeps a full-text index of everything a site publishes.

Installing it materializes a plain-text projection of every searchable entry — `search_documents` — and an
SQLite FTS5 index over that projection. Nothing queries the index yet; the public results page, ranking
and snippets follow.

Both boundaries where the index could drift from the content are closed by triggers in the database.
Core's entry change feed records what changed on one side, the projection's own triggers push into the
index on the other, and only the middle hop runs in JavaScript — because stripping HTML out of a block
tree needs a language SQLite does not have. A seed, a migration, a bulk import or any other write that
never reaches the application is therefore still indexed.

Saving an entry through the application indexes it after the response is sent, so a visitor never waits
for the work, and the entry is findable without a scheduled run. Whatever that path misses is caught when
the feed is next drained on the site's scheduled trigger; the drain is bounded per invocation so a backlog
spreads across several rather than running one past the platform's limits.

A save that leaves the text where it was writes nothing. The feed's guard ignores a metadata-only update,
and the projection's upsert carries a `DO UPDATE … WHERE` that no-ops when the extracted text has not
moved — so nothing re-tokenizes and a bulk status change stays cheap.

The projection carries the source it was extracted from as a `source_type` / `source_id` pair, so terms can
join the same index later without a migration and one ranked list can span both. Users and form
submissions are deliberately absent: they are personal data, and a predicate a public query forgets cannot
leak what the table never held.
