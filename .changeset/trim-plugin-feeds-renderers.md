---
"@plumix/plugin-feeds": minor
---

Removes `renderAtom` and `renderRss2` from the package root. Only the plugin's own feed routes used them, and there is no replacement. `FEED_LIMIT` and the feed types stay.
