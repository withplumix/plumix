---
"@plumix/core": minor
"@plumix/admin": patch
---

Entries can be created and saved untitled. A new entry is no longer seeded with
a literal "Untitled" title the author has to delete (typing prepended onto it) —
`entry.create`'s title is now optional (stored as `""`), `entry.update` accepts
an empty title (to clear it), and the editor's title field shows a placeholder.

Read surfaces render a fallback for the empty title: the public `<title>` and
feeds fall back to the site name / a fixed label, and the admin entry lists,
dashboard, and command palette show "(no title)" instead of a blank row.

Also fixes an unset single-select (`appearance: "buttons"`) that could appear to
highlight its first option when no value is set — it now shows no selection,
matching the radio control.
