---
"@plumix/blocks": minor
---

`core/rich-text` no longer surfaces a React-element `body` verbatim — that branch predated the
current editor and bypassed `sanitizeHtml`. An element body now takes the same fallback as any
other non-string value and renders an empty `<div>`.
