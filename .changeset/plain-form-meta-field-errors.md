---
"plumix": patch
---

Fixes a rejected meta value on a plain-form entry type (one without the visual editor) showing only a failed-save status. The server's path-addressed rejection is now pinned inline on the offending field, nested repeater cells included, as it already was on the visual editor, term and user forms. The next successful save clears it.
