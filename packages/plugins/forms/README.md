# @plumix/plugin-forms

This Plumix plugin adds **forms declared in your repository** — a contact page, a
newsletter signup, an enquiry form — rendered as a block and stored as rows you
can read back.

A form is a value in your code, not a row in a database. It deploys with the
code that renders it, diffs in review, and reverts with `git revert`, so local,
staging and production cannot drift apart. There is no builder, no export
format, and nothing to migrate between environments.

> This release covers the v1 field roster, repeater and group fields,
> conditional visibility, validation on the server, multi-step forms, and your
> own `validate` and `onSubmit`. The inbox and export arrive next.

## Install

```bash
pnpm add @plumix/plugin-forms
```

The plugin owns a database table, so generate and apply a migration after
adding it:

```bash
pnpm plumix migrate generate
```

Then declare a form and register the plugin:

```ts
import { plumix } from "plumix";
import { email, text } from "plumix/fields";

import { defineForm, forms } from "@plumix/plugin-forms";

const contact = defineForm("contact", {
  title: "Get in touch",
  submitLabel: "Send",
  fields: [
    text("name").label("Your name").required(),
    email("email").required(),
    text("subject"),
  ],
});

export default plumix({
  // …your runtime, database, and auth
  plugins: [forms({ forms: [contact] })],
});
```

## Fields

A form's questions are the same fluent builders meta boxes use, so the
submission payload types itself:

| Builder             | Control              | Stored as               |
| ------------------- | -------------------- | ----------------------- |
| `text` / `textarea` | text input, textarea | `string`                |
| `email` / `url`     | typed input          | `string`                |
| `tel`               | telephone input      | `string`                |
| `number`            | number input         | `number`                |
| `date`              | date input           | ISO `string`            |
| `select`            | dropdown             | option value, or values |
| `toggle`            | checkbox             | `boolean`               |
| `group`             | fieldset of fields   | object under its key    |
| `repeater`          | rows of fields       | array of row objects    |

Everything but `tel` comes from `plumix/fields`. `tel` is this plugin's own
contribution to the field vocabulary — core has no built-in for it — so it
imports from `@plumix/plugin-forms/fields` and works anywhere a field does,
meta boxes included:

```ts
import { tel } from "@plumix/plugin-forms/fields";
```

`FormAnswersOf<typeof contact>` is what one submission of that form stores —
one property per field, optional unless `.required()`. Renaming a field breaks
the build at every reader rather than in production.

An answer the visitor never gave is absent from the row rather than stored
empty. The exceptions are the two controls that always answer: an unticked
checkbox reads `false`, and a multiple choice with nothing picked reads an
empty list. A field its condition hid is absent too, `.required()` or not — so
read a conditional field's answer as optional whatever its type says.

## Rows and groups

A `group` puts related questions in a fieldset and stores them under one key. A
`repeater` gives the visitor as many rows as they have things to say — referees,
attendees, statements — and stores them as an array of row objects:

```ts
import { group, repeater, text, toggle } from "plumix/fields";

const vegetarian = toggle("vegetarian");

const rsvp = defineForm("rsvp", {
  fields: [
    group("contact").fields([text("name").required(), tel("phone")]),
    repeater("attendees")
      .fields([
        text("who").label("Name").required(),
        vegetarian,
        text("dietary").visibleWhen(vegetarian.isOn()),
      ])
      .max(6),
  ],
});
```

One submission of that stores
`{ contact: { name: "Ada" }, attendees: [{ who: "Grace", vegetarian: false }] }`,
and `FormAnswersOf<typeof rsvp>` says so.

`.fields()` comes first in both chains — it is the call that infers the row
shape, so `repeater("attendees").label("Attendees")` will not compile.

Rows carry their own conditions. A rule inside a row is judged against **that
row's** answers and nothing else's, so one attendee's dietary note appears
because that attendee is vegetarian, not because their neighbour is. The server
applies the same rule row by row, which is what keeps a hidden sub-field out of
that row's stored values.

A row nobody filled in is not an answer: it is dropped rather than stored blank,
and nothing inside it is validated — including a `.required()` sub-field. So
`.min()` and `.required()` count the rows the visitor actually used, while
`.max()` counts the rows that came back at all, since the form never renders
more than it takes. Both are enforced on the server whatever the browser did,
and a repeater that declares no `.max()` still has one — 100 rows, because the
request body is the visitor's to write.

With JavaScript on, the visitor adds and removes rows on the page, and focus
moves to the add button when a row goes rather than being dropped with it. With
it off they get the fewest rows the repeater accepts — and never fewer than one
— since adding a row means asking the server for one and this plugin's endpoint
answers submissions rather than serving forms. For the same reason a row past
that floor carries no browser-side `required`: the server asks a blank row
nothing, and a browser refusing to submit over a row nobody has to fill would
strand a visitor who has no other way through.

Nested fields post under a bracketed name — `contact[name]`,
`attendees[0][who]` — which is also what an error names and what the styling
attributes below carry.

## Fields that only sometimes apply

A field can name a condition on a sibling, exactly as it would in a meta box:

```ts
const plan = select("plan").options(["basic", "pro"]);

const signup = defineForm("signup", {
  fields: [plan, number("seats").visibleWhen(plan.is("pro"))],
});
```

The same rule is judged in both places: the markup leaves out a field the
form's own defaults hide, and the server drops one the submitted answers hide —
so a hidden field never reaches the stored payload, and is never held to its
own `required`, even if something posts a value for it anyway.

## Forms in steps

A long form becomes a wizard by putting a break in the field list:

```ts
import { pageBreak } from "@plumix/plugin-forms";

const survey = defineForm("survey", {
  fields: [
    text("name").required(),
    email("email").required(),
    pageBreak("Your plan"),
    plan,
    pageBreak("Anything else"),
    number("seats").visibleWhen(plan.is("pro")),
    textarea("notes"),
  ],
});
```

The break is an element of the same flat list, not a level of nesting, so
nothing else about the form changes: the answers type, a field's condition and
the stored row are what they would be without it. A break's title, where you
give one, names the step that follows it and is what the progress indicator
shows; a step you leave untitled reads as "Step 2 of 3". A break at either end
of the list, or two written in a row, come to nothing.

With JavaScript the visitor fills one step at a time. Moving on checks only the
fields that step actually shows — a question further on, or one this step's own
answers hide, cannot hold them up — and takes focus to the new step's heading.

How far they have got, and every answer behind them, is kept in session storage
for the tab they are filling the form in, written whenever they move between
steps and whenever a step is refused, so a reload puts them back where they were
rather than at the start. It is cleared once the submission is made, and a
browser that refuses site data costs them nothing but that.

A field can name a driver on an earlier step, which is how a step gets skipped:

```ts
fields: [plan, pageBreak("Seats"), number("seats").visibleWhen(plan.is("pro"))];
```

A step whose every field is hidden is not shown at all — so with `basic` chosen
the form above is one step and its button submits, and with `pro` it is two and
the same button moves on. What the button says and what pressing it does are
read from the same answers, so the two cannot come apart as the visitor types.
As everywhere else, a hidden field is absent from the stored submission and is
never held to its own `required`.

Switch JavaScript off and the same form renders as one long form and submits in
one go — the wizard is an enhancement, not a requirement, so a break can be
added to a form that is already live without anyone losing the ability to send
it.

The slug is the form's identity. Submissions carry it and nothing else links
them back, so renaming a form orphans its history. Two forms claiming one slug
fail at boot, naming both contributors.

## Placing it on a page

The plugin registers a `forms/form` block. An editor inserts it and picks a
form from the ones that exist; nothing else needs wiring.

The block server-renders static markup — the same bytes for every visitor, so
the page carrying it stays edge-cacheable — and it submits as a plain HTML
`POST` with no JavaScript on the page at all.

## What JavaScript adds

An island takes over that same markup — it renders the form the server already
sent rather than standing in for one. With it running, submitting does not
reload the page: the answers go over `fetch`, errors come back against the
fields that produced them, and a confirmation replaces the form. The form
carries `data-plumix-form-enhanced` once the island is driving it — the handle
to style an upgraded form differently, and the one signal that tells the two
apart.

It also fetches a short-lived timing token from `/_plumix/forms/token`, an
endpoint nothing caches. That token is the second half of the spam floor: a
submission completed implausibly fast is held as `spam` the same way a filled
honeypot is. It is fetched rather than rendered because the page carrying the
form is edge-cached and can therefore carry nothing about the visitor reading
it.

Like the honeypot, it is a floor rather than a control, and the trade is worth
knowing: a submission carrying no token is not timed — that is what every
no-JavaScript submission is — so a bot skips the check by omitting the field,
while a visitor whose token request was slow to arrive can be filed as `spam`.
Both defences hold what they catch rather than discarding it, which is what
makes a false positive recoverable.

Switch JavaScript off and the same markup posts to the same endpoint. A
submission the server rejects comes back as the form again, carrying what you
answered and the errors against the fields that produced them; correcting it
returns you to the page the form was on.

## Validation

Every answer is checked on the server, whichever way it arrived: a required
field must be answered, an email field must look like an address, a `url` must
be a web address, a `number` is held to its declared bounds, and a field
declaring `maxLength` is held to that. A field its condition hides is never
asked about, so a question the visitor was not shown cannot hold their
submission up.

The browser's own `required`, `type` and range checks still run on the plain
form, so most mistakes are caught before a request is made; the server is what
makes the rule true. A wizard applies the same rules, from the same code, when
the visitor moves off a step — so what a step refuses is what the server would
have refused. Errors are returned as `{ field, message }` — the island
renders them inline, and the no-JavaScript path renders the same pair
server-side.

### Your own rules

A form carries the checks its fields cannot express, beside the fields
themselves. Return one error per field you are refusing, named against that
field; return nothing to accept:

```ts
const enquiry = defineForm("enquiry", {
  fields: [text("name").required(), number("guests")],
  validate: ({ answers }) =>
    answers.guests !== undefined && answers.guests > 4
      ? [{ field: "guests", message: "We seat four." }]
      : undefined,
});
```

It runs on the server only, and only once every field-level rule has passed —
so `answers` is already the shape the row stores, not whatever the body
carried. It is `async` if you make it: `ctx` is the request context, so a
check against the database is a query away.

It runs _before_ the spam floor, so that a trapped bot is answered exactly as
a person answering badly is. That means your `validate` runs for spam traffic
too, on a route with no rate limit — keep what it does proportionate to that,
and put anything expensive behind the `form:validate` filter below, which the
floor's verdict reaches.

`answers` is the object that goes on to be stored, not a copy — `readonly` is
a compile-time promise. A `validate` that mutates it changes what is stored.

## What happens next

A form says what to do with a submission it has accepted:

```ts
import { defineForm, formatSubmission } from "@plumix/plugin-forms";

const enquiry = defineForm("enquiry", {
  fields: [text("name").required(), email("email").required()],
  onSubmit: async ({ ctx, ...submission }) => {
    await notify(ctx, formatSubmission(submission));
  },
});
```

The order is **validate, then store, then the handler**, and that order is the
promise: the submission is on disk before your handler runs, so a handler that
throws cannot lose it. When one does, the visitor is still told their enquiry
was received — because it was — and the reason is recorded on the row for
whoever reads the inbox. Nothing retries it: the row is the record that
something is owed.

The visitor waits for your handler, so a slow third party is a slow response.
Keep it to what has to happen now, and hand anything else to a queue.

A submission the spam floor caught does **not** reach `onSubmit`. Stopping the
notification is the point of the floor — labelling the row is not enough if the
email goes out anyway — and the row is still stored, so a false positive is
still there to be found. Listen on `form:submitted` for the ones the floor
caught.

`onSubmit` is given the answers, the label snapshot, the stored row (`null`
when the form stores nothing), and the request context.

### Forms that own their destination

A form whose handler writes somewhere else — your own table, a CRM — can opt
out of storage entirely and keep everything else:

```ts
defineForm("signup", {
  fields: [email("email").required()],
  store: false,
  onSubmit: ({ ctx, answers }) => subscribe(ctx, answers.email),
});
```

It is still validated, still meets the spam floor, and still runs its handler,
with nothing written to `form_submissions`. `store: false` without an
`onSubmit` throws at boot: that form would accept submissions and discard
them.

This is where the spam floor costs something. A flagged submission reaches
neither storage nor the handler, so for a form that stores nothing, a false
positive is gone — which is the trade for opting out, and the reason storage
is the default.

### Formatting a submission

`formatSubmission` renders one as readable text — every answer under what its
field was called, in the order the form asked, choices as their option labels
and repeater rows one at a time — so a notification email does not hand-roll
formatting:

```
Your name: Ada
Email: ada@example.test
Plan: Pro
Message:
  Two lines,
  as given.
```

It reads the submission's own label snapshot rather than the live form, so it
still renders correctly after the form is renamed. A question left unanswered
is left out. Pass it the stored row, or the `{ answers, labels }` your handler
was given.

## Hooking every form

Two hooks cover what belongs across all forms rather than in one, so a plugin
needs no per-form wiring:

```ts
ctx.addFilter("form:validate", (errors, candidate) =>
  isSpam(candidate.answers)
    ? [...errors, { field: "", message: "No." }]
    : errors,
);

ctx.addAction("form:submitted", (submission, candidate) => {
  if (submission) index(submission);
});
```

`form:validate` is the last word before anything is written: it sees a
submission every other check has accepted, and the errors it returns reject it
exactly as a field rule's do. `form:submitted` fires once the row is stored and
the form's own handler has run — the row it carries is `null` only for a form
that opted out of storage, and one carrying `handlerError` is one whose handler
threw.

## Accessibility

This is a contract, not a review note. Every control has a label that points at
it; help text and errors are wired to their control through `aria-describedby`;
a control that failed carries `aria-invalid`; a failed submit renders a live
`role="alert"` summary, takes focus to it, and links each message to the
control that produced it. A required field is marked with a glyph as well as
the `required` attribute, never by colour alone. Every step change takes focus
to the new step's heading, and the step being filled in is marked
`aria-current="step"` in the progress indicator.

## Contributing a form from your own plugin

A plugin can ship a form of its own:

```ts
import { definePlugin } from "plumix";
import { email } from "plumix/fields";

import { defineForm } from "@plumix/plugin-forms";

export const newsletter = definePlugin("newsletter", (ctx) => {
  ctx.registerForm(
    defineForm("newsletter", { fields: [email("email").required()] }),
  );
});
```

Registration order does not matter: `@plumix/plugin-forms` may sit before or
after yours in the `plugins` array.

## Styling

The plugin ships no colour, type or borders — the form inherits your theme's
input and button styling. Every part carries a stable class and a data
attribute, both public API:

| Part          | Class                      | Attribute                              |
| ------------- | -------------------------- | -------------------------------------- |
| The form      | `plumix-form`              | `data-plumix-form="<slug>"`            |
| Title         | `plumix-form-title`        | `data-plumix-form-title`               |
| Field wrapper | `plumix-form-field`        | `data-plumix-form-field="<name>"`      |
| Label         | `plumix-form-label`        | `data-plumix-form-label`               |
| Control       | `plumix-form-control`      | `data-plumix-form-control="<name>"`    |
| Help text     | `plumix-form-help`         | `data-plumix-form-help`                |
| Field error   | `plumix-form-error`        | `data-plumix-form-error="<name>"`      |
| Required mark | `plumix-form-required`     | `data-plumix-form-required`            |
| Group         | `plumix-form-group`        | `data-plumix-form-group="<name>"`      |
| Repeater      | `plumix-form-repeater`     | `data-plumix-form-repeater="<name>"`   |
| Repeater row  | `plumix-form-row`          | `data-plumix-form-row="<name>"`        |
| Fieldset name | `plumix-form-legend`       | `data-plumix-form-legend`              |
| Add a row     | `plumix-form-row-add`      | `data-plumix-form-row-add="<name>"`    |
| Remove a row  | `plumix-form-row-remove`   | `data-plumix-form-row-remove="<name>"` |
| Error summary | `plumix-form-summary`      | `data-plumix-form-summary`             |
| Actions       | `plumix-form-actions`      | `data-plumix-form-actions`             |
| Submit button | `plumix-form-submit`       | `data-plumix-form-submit`              |
| Confirmation  | `plumix-form-confirmation` | `data-plumix-form-confirmation`        |

`<name>` is the field's key at the top of the form and its bracketed path below
that. The add and remove buttons are on the page only while the island is
driving the form.

A form broken into steps carries five more, none of which a plain form has:

| Part               | Class                                   | Attribute                                         |
| ------------------ | --------------------------------------- | ------------------------------------------------- |
| Progress indicator | `plumix-form-steps`                     | `data-plumix-form-steps`                          |
| One step's mark    | `plumix-form-step-marker`               | `data-plumix-form-step-marker="<n>"`              |
| The step on screen | `plumix-form-step`                      | `data-plumix-form-step="<n>"`                     |
| Step heading       | `plumix-form-step-title`                | `data-plumix-form-step-title`                     |
| Back / Next        | `plumix-form-back` / `plumix-form-next` | `data-plumix-form-back` / `data-plumix-form-next` |

The mark for the step being filled in carries `aria-current="step"`.

An enhanced form also carries `data-plumix-form-enhanced` on the `<form>`
itself.

The one exception is the honeypot, hidden inline: a trap the visitor can see is
a trap they fill in.

## What gets stored

Each submission is a row in `form_submissions`: the form's slug, a per-form
serial you can quote to whoever sent it, the answers, and a snapshot of what
every field and option was called at the time. That snapshot is what keeps the
row readable after the form changes — without it a renamed field reads as a raw
key.

A submission whose `onSubmit` threw carries the reason in `handler_error`. The
answers are untouched — what failed is what the site meant to do next with
them.

The visitor's IP address is stored only as a salted SHA-256, against a
per-install salt minted on the first submission. Cleartext addresses are never
written.

A submission that fills the honeypot, or that arrives implausibly fast after
the timing token was issued, is answered exactly like a real one and stored
with `spam` status — held rather than discarded, so a false positive
stays recoverable. The trap's field name is the same on every Plumix site, so
it stops undirected bots rather than one aimed at you; the request body is
capped, and flood protection belongs at your edge (a Cloudflare WAF rule) where
it beats counting rows.
