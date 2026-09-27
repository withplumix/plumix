---
"@plumix/plugin-search": patch
---

Fixes search results showing entry title shortcodes such as `[year]` literally. The index still holds the raw title, so searching for the shortcode text still finds the entry.
