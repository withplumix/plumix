---
"@plumix/plugin-og": minor
---

Removes `tag` from `CardKey`: `cardKey.of` and `cardKey.entry` return only the `id` the card's URL is digested from. An entry card is no longer purged from the CDN when its entry is edited or trashed; the edit publishes a new card URL, and the old card stays stored until it expires.
