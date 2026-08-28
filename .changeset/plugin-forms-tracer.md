---
"@plumix/plugin-forms": minor
---

Adds `@plumix/plugin-forms`, which renders a form you declared in your own code and stores what visitors send.

A form is a value in your repository, written with the field builders you already use for meta boxes and registered in `plumix.config.ts`. It deploys with the code that renders it, diffs in review, and reverts with `git revert` — there is no builder, no `forms` table, and no environment-local state to drift. A plugin can contribute one of its own through `ctx.registerForm`, and two forms claiming one slug fail at boot naming both contributors.

The `forms/form` block server-renders static markup — the same bytes for every visitor, so the page carrying it stays edge-cacheable — and submits as a plain HTML `POST` that works with JavaScript disabled. The plugin ships no colour, type or borders; every part carries a stable class and data attribute.

Each submission lands in `form_submissions` with a per-form serial, the answers, and a snapshot of what every field and option was called at the time, so the row still reads correctly after the form changes. The visitor's address is stored only as a salted hash, and a submission that fills the honeypot is answered like a real one and held as `spam`.

This is the first slice: text and email fields only, and a submission is stored as it arrived — required fields and email format are not yet enforced on the server. Inline errors and the island, the full field roster, conditional visibility, multi-step forms, `validate` / `onSubmit`, translated catalogs for the plugin's own strings, and the submissions inbox and export arrive next.
