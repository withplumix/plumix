---
"@plumix/plugin-forms": minor
---

Adds multi-step forms: write `pageBreak()` among a form's fields and a visitor with JavaScript fills it in a step at a time.

The break is an element of the flat field list rather than a level of nesting, so nothing else about a form changes — the answers type, a field's condition and the stored payload are the same whether or not the list is broken. The wizard is derived from the breaks at render time: `pageBreak("Your enquiry")` titles the step that follows it, and a step every answer leaves empty is skipped rather than shown as a page with nothing on it.

Moving on checks only the fields the current step actually shows, against the same rules the server applies, and takes focus to the new step's heading. Progress — the step and every answer behind it — is kept in session storage, so a reload puts the visitor back where they were. A field whose condition names a driver on an earlier step is evaluated as the visitor moves forward, and one that condition hides is absent from the stored submission.

Without JavaScript the same form renders as one long form and submits in one go, so the wizard is an enhancement rather than a requirement.

New markup, all of it public API to style: `plumix-form-steps` / `data-plumix-form-steps` on the progress indicator and `plumix-form-step-marker` on each of its entries, `plumix-form-step` / `data-plumix-form-step` on the step on screen, `plumix-form-step-title` on its heading, and `plumix-form-back` / `plumix-form-next` on the two buttons that move between steps.
