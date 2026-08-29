---
"@plumix/plugin-forms": minor
---

Adds a form's own `validate` and `onSubmit`, a storage opt-out, a formatting helper, and two hooks for plugins.

A form can now carry the checks the field builders cannot express and the thing to do with an accepted submission, both written beside the form they belong to:

```ts
defineForm("enquiry", {
  fields: [
    text("name").required(),
    email("email").required(),
    number("guests"),
  ],
  validate: ({ answers }) =>
    answers.guests !== undefined && answers.guests > 4
      ? [{ field: "guests", message: "We seat four." }]
      : undefined,
  onSubmit: async ({ ctx, ...submission }) =>
    sendEnquiry(ctx, formatSubmission(submission)),
});
```

The order is validate, then store, then the handler, and a submission the spam floor caught reaches storage but not the handler — stopping the notification is what the floor is for. Persisting first is what makes a thrown handler safe: the submission is already on disk, the visitor is told their enquiry was received — because it was — and the failure is recorded on the row as `handler_error` for whoever reads the inbox. A form whose handler owns the destination can set `store: false` and keep validation, the spam floor and its handler with nothing written to `form_submissions`; doing that without an `onSubmit` throws, since that form would discard every submission it accepted.

`formatSubmission({ answers, labels })` renders a submission as readable text — every answer under what its field was called, choices as their option labels, repeater rows one at a time — so a notification does not hand-roll formatting. It reads the row's own label snapshot, so it still renders correctly after the form is renamed.

Two hooks cover what belongs across every form rather than in one. The `form:validate` filter is the last word before anything is written: it sees a submission every other check has accepted, and the errors it returns reject it exactly as a field rule's do. The `form:submitted` action fires after the row is stored and after the handler ran, carrying the row and the submission it came from.
