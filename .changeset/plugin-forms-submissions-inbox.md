---
"@plumix/plugin-forms": minor
---

Adds the submissions inbox: one admin page under Content → Form submissions where an
administrator works through what has come in, instead of relying on a notification email that may
have bounced.

The list is newest first and cursor-paginated, filtered by form and by status with a count beside
each. Columns are read from each row's own label snapshot rather than joined to the live form, so a
page mixing two generations of one form still names every column and a submission whose form has
since been deleted still reads under the questions it was actually asked. The form filter offers
what the registry declares now plus any slug that still has a backlog, which is how a retired
form's submissions stay reachable.

A submission whose `onSubmit` threw is marked as failed in the list, so the ones that owe someone
something are findable without opening each in turn. Opening a submission shows every answer under
its real label, the envelope it arrived in — when, which page's entry, the IP hash, the user agent
— and the reason the handler did not finish. It can be marked read, archived or spam, or deleted;
spam is a status rather than a discard, so a false positive is a click away from coming back, and
deleting is the one thing on the page that asks first. A private note can be left for whoever picks
the submission up next, stored in a new `note` column on `form_submissions` and never shown to the
visitor.

The page is behind a new `form_submission:moderate` capability, registered at editor level, and the
list of forms comes from the plugin's own registry over its RPC router — no forms table and no
admin manifest entry are involved.
