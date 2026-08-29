---
"@plumix/plugin-forms": minor
---

Adds two ways for a theme to render a form without the block. `PlumixForm` from
`@plumix/plugin-forms/theme` puts a form into a template by slug, and
`usePlumixForm` from `@plumix/plugin-forms/headless` hands a theme's own island
the form's fields, a typed submit call and `{ field, message }` errors — so a
form that is mostly bespoke UI still gets validation, the spam floor and
storage. A theme registering a block named `forms/form` still replaces the
plugin's render outright.
