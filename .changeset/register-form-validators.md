---
"@plumix/plugin-forms": minor
---

Adds `ctx.registerFormValidator({ id, forms?, validate })` for validating submissions across forms, and removes the `form:validate` filter it replaces. Every registered validator's errors are collected, so no validator can drop another's; `forms` limits one to the listed slugs, and a validator that throws is logged and refuses nothing. A slug no form declares, or a second validator with a taken `id`, fails boot. Move a `ctx.addFilter("form:validate", …)` handler to a validator that returns its own errors.
