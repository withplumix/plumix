---
"plumix": minor
---

Fixes field adornments never rendering: `.prepend()` and `.append()` now show their text before and after the input in the admin, on `text`, `textarea` (as strips above and below the box), `email`, `url`, `password` and the URL input of `link`. The stored value stays what was typed. Adds `.prepend()` / `.append()` to `number()`, and `InputGroup` to `plumix/admin/ui`. Breaking: `prepend` and `append` no longer type-check on object-literal fields of any other type, including the catch-all for plugin-registered types.
