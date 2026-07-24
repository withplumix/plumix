---
"@plumix/admin": patch
---

Restore spacing inside settings group cards. The `<form>` wrapper sat between
the card and its sections, swallowing the card's column gap — so the Save
button (and the group's fields) collapsed against the last control. The form
now carries the card's flex column spacing, giving each settings group the same
header / content / footer rhythm as every other card.
