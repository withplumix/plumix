---
"@plumix/plugin-forms": minor
---

Enhances the rendered form with an island, validates every submission on the server, and commits to an accessibility contract.

With JavaScript, submitting no longer reloads the page: the answers go over `fetch`, errors come back against the fields that produced them, and a confirmation replaces the form. The island renders the markup the server already sent rather than standing in for it, and marks it `data-plumix-form-enhanced` once it is driving it. Switch JavaScript off and the same markup posts to the same endpoint — a rejected submission comes back as the form again, carrying what the visitor typed, and correcting it returns them to the page the form was on.

Every answer is now checked on the server whichever way it arrived: a required field must be answered, an email field must look like an address, and a field declaring `maxLength` is held to it. Errors are returned as `{ field, message }` and rendered the same way on both paths.

The island fetches a short-lived timing token from `/_plumix/forms/token`, an endpoint nothing caches — fetched rather than rendered because the page carrying the form is edge-cached and can carry nothing about the visitor reading it. A submission completed implausibly fast is held as `spam`, the same way a filled honeypot is.

Accessibility is a contract here rather than a review note: every control has a label that points at it, help text and errors are wired through `aria-describedby`, a failed control carries `aria-invalid`, a failed submit renders a live `role="alert"` summary and takes focus to it, and a required field is marked with a glyph as well as the `required` attribute — never by colour alone. An axe pass over the rendered form runs in the plugin's own end-to-end suite.
