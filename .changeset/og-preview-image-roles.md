---
"@plumix/plugin-og": patch
---

Fixes the editor's card preview missing a `.featured()` or `.ogImage()` field nested in a group. The preview reads the entry's role images rather than walking its meta box for them, so it names the same picture the page's head does.
