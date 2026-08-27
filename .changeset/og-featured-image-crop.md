---
"@plumix/core": minor
---

Moves the `seo:og_image` filter above the entry's `.featured()` image, so a
generated social card can outrank the entry's own photo when a theme asks it
to. The filter's incoming value stays `null` — returning it, or returning
`null` from a page a subscriber does not handle, leaves the photo exactly where
it was — and the photo is passed as a fourth argument instead, so a subscriber
can improve on it (crop it to a card's shape) rather than only replace it. An
explicit `.ogImage()` role still short-circuits above everything. The one
behaviour change: an image a subscriber returns now outranks `.featured()`,
where before the photo won unconditionally. `OgImage` is exported for
subscribers that name the type.
