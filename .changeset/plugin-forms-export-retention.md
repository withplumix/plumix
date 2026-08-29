---
"@plumix/plugin-forms": minor
---

Adds submission export as CSV and JSON, and a per-form retention period purged nightly.

Both export buttons sit beside the inbox's filters and write exactly what is in view — the active form and status, and every submission under them rather than the page you can see. CSV leads with the envelope (received, form, number, status), then a column per question, then your note; JSON carries the whole row, answers nested as stored, with the entry the form was bound to, the hashed address, the user agent and any handler failure. Columns come from the rows' own label snapshots, so an export spanning two generations of a form names every column and a submission whose form has since been deleted still exports under the questions it was actually asked. Both come from `GET /_plumix/forms/export`, behind the same `form_submission:moderate` capability the inbox is. Because the columns come from the rows, an export is held whole in memory; past 20,000 submissions it is refused rather than truncated, asking you to narrow it.

An exported answer opening with `=`, `+`, `-`, `@` or a tab is prefixed with an apostrophe, so a visitor who types `=WEBSERVICE("https://…")` into a name field has written text rather than a formula that runs on the machine of whoever opens the file. A number below zero is left alone.

A form now says how long its submissions are kept, beside the fields that collect them:

```ts
defineForm("contact", {
  fields: [text("name").required(), email("email").required()],
  retentionDays: 90,
});
```

One nightly scheduled task purges every form on the site, on `0 3 * * *` — declare that cron in your `wrangler.jsonc` for it to fire. `retentionDays: 0`, which is what a form declaring nothing takes, keeps submissions indefinitely; past the period a submission goes whatever status it is under, since an archived enquiry is still someone's address. A slug nobody declares any more is left alone.
