---
"plumix": minor
---

Adds named layout utilities to the admin theme, so plugin admin source can use them in place of arbitrary values: `max-h-dialog` (85vh), `max-h-sticky-panel`, `h-editor-body`, `grid-cols-media`, `grid-cols-label-value`, `aspect-og-card` and `transition-width`. Admin dialogs capped at 70vh or 90vh now share the 85vh cap, and the destructive confirm buttons render through `AlertDialogAction`'s `variant` prop.
