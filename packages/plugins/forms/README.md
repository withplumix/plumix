# @plumix/plugin-forms

This Plumix plugin adds **forms declared in your repository** — a contact page, a
newsletter signup, an enquiry form — rendered as a block and stored as rows you
can read back.

A form is a value in your code, not a row in a database. It deploys with the
code that renders it, diffs in review, and reverts with `git revert`, so local,
staging and production cannot drift apart. There is no builder, no export
format, and nothing to migrate between environments.

> This release covers the v1 field roster, repeater and group fields,
> conditional visibility, validation on the server, multi-step forms, your own
> `validate` and `onSubmit`, the theme component and headless hook, and an
> opt-in Turnstile captcha. The inbox and export arrive next.

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

## Carrying the page's entry

A form placed on an entry's page can carry that entry, so a subscribe form on
a school's page knows which school without you wiring one through the block,
the template or the theme. Declare what it binds:

```ts
const subscribe = defineForm("subscribe", {
  bind: "entry",
  fields: [email("email").required()],
  onSubmit: ({ entryId, answers }) => enrol(entryId, answers.email),
});
```

The value is resolved on the server at render — from the entry the URL
already matched, so it costs no second lookup — and travels as a token signed
with a per-install secret. The secret is generated the first time one is
needed and kept in the settings table, so there is no environment variable and
no binding to configure.

Nothing carries the bound value in the clear, which is the point. Every other
form system puts it in a plain hidden input, one devtools edit away from
submitting against a different entry; here the value and its signature travel
together and the server reads the value back only out of a token it signed.
Edit either half and the submission is refused with a `403`, as is a token
minted for one form and replayed against another — the form's slug is inside
what was signed.

`entryId` reaches `validate` and `onSubmit`, and is stored in its own indexed
`entry_id` column rather than among the answers, so _every submission for this
entry_ is a query:

```ts
import { eq } from "plumix/db";

import { formSubmissions } from "@plumix/plugin-forms/schema";

const enquiries = await ctx.db
  .select()
  .from(formSubmissions)
  .where(eq(formSubmissions.entryId, school.id));
```

A bound form placed somewhere with no entry to bind carries no token and stores
no entry — a front page, a footer, and also an archive or a synced pattern,
where the block is rendered but the entry is not resolved for it. The same goes
for the two surfaces below that are not the block: signing is asynchronous and a
template's render is not, so the token comes from a block loader and only the
block has one. A form that declares no `bind` carries nothing either way. Read
`entryId` as though it were optional wherever the same form appears in more than
one place.

The token does not expire, because the page carrying it is edge-cached and an
expiry would be about the visitor rather than the page. `entry_id` carries no
foreign key for the same reason `form_slug` does not: a submission is a record
of what someone sent, and deleting the entry should not delete it.

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

## Rendering it yourself

Three surfaces render one definition, and each gives up more of the
plugin's rendering than the last.

### From a theme template

Drop a form straight into a template, with no block on the page:

```tsx
import { PlumixForm } from "@plumix/plugin-forms/theme";

export const contactPage = defineTemplate({
  render: () => (
    <main>
      <h1>Get in touch</h1>
      <PlumixForm slug="contact" />
    </main>
  ),
});
```

It renders exactly what the block renders — the same markup, the same
island over it, the same no-JavaScript submit — so a form in a template
and a form on a page are the same form. A slug nobody registered renders
nothing, which keeps a template that outlives its form from taking the
page down with it.

Give it an `id` when one form appears twice on a page — including once
from a template and once from a block, which default to the same ids
when the block's node is unnamed. Control ids are built from it and a
label points at its control by id, so without one the second form's
labels address the first form's controls (and a form in steps shares the
other's saved progress):

```tsx
<PlumixForm slug="contact" id="header" />
<PlumixForm slug="contact" id="footer" />
```

### By replacing the block

A theme registering a block of the plugin's own name replaces its render
outright — theme blocks win over plugin blocks — so total control never
means forking:

```ts
export const theme = defineTheme({
  blocks: [defineBlock({ name: "forms/form", title: "Form", render: MyForm })],
  templates: [...],
});
```

The editor still inserts `forms/form` and still picks from the forms that
exist. What changes is who renders it.

### Headless, in your own React

For a form that is mostly bespoke UI — a subscribe bar that is one input
and a button, wrapped in a sticky reveal, a dismiss control and an
analytics event — take the fields, a submit call and the errors, and
write the rest yourself. Hand the form's shape to your island from the
template:

```tsx
import { formWire } from "@plumix/plugin-forms/theme";

const subscribe = formWire("subscribe");

// `formWire` is undefined for a slug nobody registered, exactly as
// `PlumixForm` renders nothing for one.
{
  subscribe ? <SubscribeBar client="load" form={subscribe} /> : null;
}
```

and drive it there:

```tsx
"use client";

import { usePlumixForm } from "@plumix/plugin-forms/headless";

import type { subscribe } from "../forms.js";

export function SubscribeBar({ form }: IslandProps<{ form: FormWire }>) {
  const { submit, submitting, confirmation, errorFor } =
    usePlumixForm<typeof subscribe>(form);
  const [email, setEmail] = useState("");
  if (confirmation) return <p>{confirmation}</p>;
  return (
    <>
      <input value={email} onChange={(e) => setEmail(e.target.value)} />
      <button disabled={submitting} onClick={() => void submit({ email })}>
        Subscribe
      </button>
      {errorFor("email") ? <small>{errorFor("email")}</small> : null}
    </>
  );
}
```

Nothing here is the plugin's: no markup, no class names, no stylesheet.
The hook posts to the same endpoint the rendered form posts to, so the
submission is validated, met by the spam floor and stored identically —
`fields` is the form's questions in the order it asks them, `errors` is
the same `{ field, message }` list every other surface gets, and
`errorFor("")` is the one that names no field, which is what a submission
that never reached the server produces.

The type argument is the form itself, imported with `import type` so no
server-only callback is dragged into the browser bundle. It is what makes
`submit` take that form's answers: a renamed field breaks the build here
too. Fields the form does not insist on may be left out, and each falls
back to its declared default — what a visitor served the blank form and
leaving that control alone would have posted.

Half the spam floor is a field in markup this hook does not render, so
what survives is the timing token, which the hook fetches on mount
exactly as the plugin's own island does. A form that is mostly bespoke UI
therefore has a honeypot's worth less defence than the rendered one.

For the same reason, do not give a form you drive from here a
`turnstile`: the widget is markup this hook does not render, so every
submission would arrive with no challenge and be refused.

`submit` ignores a call made while one is still in flight, so a button
pressed twice sends one enquiry whether or not you disable it on
`submitting`.

#### What the hook does not do for you

`fields` is the form's questions **as declared**. Two things the rendered
form derives from them are yours to handle here:

- **`visibleWhen` is not applied.** The hook does not hold your answers,
  so it cannot judge a condition. Render a conditional field and the
  server will drop the answer — correctly, since it applies the rule
  itself — leaving a question that appears to do nothing. Drive a form
  with conditions through the block or `PlumixForm`, or evaluate the rule
  yourself.
- **A `pageBreak()` is not a step.** The hook exposes no wizard, so a form
  broken into steps renders as one long list of questions. That still
  submits correctly; it is just not a wizard.
- **`bind: "entry"` carries no entry.** The signed token comes from a
  block loader, so a bound form driven from here stores no `entryId` —
  the same position as one on an archive. `PlumixForm` is in it too.

## A captcha, where one is needed

Every form already meets a spam floor it cannot turn off: a honeypot and the
timing check above. Turnstile is the third defence, and it is opt-in — a
captcha belongs on the form that is actually being attacked, not on the
enquiry form nobody has ever spammed.

Give the form a site key and a secret from your Cloudflare dashboard:

```ts
const contact = defineForm("contact", {
  fields: [text("name").required(), email("email").required()],
  turnstile: {
    siteKey: "0x4AAAAAAA…",
    secret: (env) => env.TURNSTILE_SECRET,
  },
});
```

The site key is public — it is what the widget renders from. The secret takes
core's environment-input union, so writing it as `(env) => env.MY_SECRET` reads
it from the per-request bindings on Cloudflare Workers, where the config module
is evaluated long before any request and secrets never appear in `process.env`.
A literal string works for a runtime where one is available at config time.
Resolution is memoized per isolate, the same as every other secret-bearing
config slot, so a rotated secret is picked up when the isolate recycles rather
than on the next request.

The secret cannot reach a browser: `FormWire` — the shape every renderer and
the island take — declares `secret?: never`, so handing a form definition
straight to one is a compile error and only what `toFormWire` built can cross.

The widget renders once, above the submit button, and on a form broken into
steps only on the step that submits — a challenge solved two steps early is a
token that may have expired by the time it is posted. It is rendered by the
block and by `PlumixForm`, and not by `usePlumixForm`, which renders no markup
at all: a form driven from the headless hook should not declare one.

**A guarded form needs JavaScript.** The widget is drawn by Cloudflare's
script, so this is the one place this plugin's no-script path stops: a visitor
with JavaScript off is told so where the challenge would have been, rather than
being left at an empty box and a submit button that will always be refused.
Every other form still submits without it.

On submit, the challenge is checked with Cloudflare after the field-level rules
and your own `validate` have passed, and before the spam floor. A submission
that does not clear it is refused with a message the visitor can act on, and
the island draws a fresh challenge so their retry has one to send — a Turnstile
token is spent the moment it is verified. Because the check sits below
`validate`, your own rules still run for traffic that has not solved anything;
keep them cheap, or move the expensive part into `onSubmit`.

The check fails closed: a Cloudflare outage, a secret nobody configured and an
answer that did not decode all refuse the submission rather than waving it
through. Which of them happened is in your logs.

Rate limiting is deliberately not here. On Cloudflare that is a WAF rule, which
is both cheaper and better placed than counting rows in your database.

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
| Captcha       | `plumix-form-captcha`      | `data-plumix-form-captcha`             |
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

A form that binds the page's entry stores it in `entry_id`, indexed so that
reading every submission for one entry is a query rather than a scan.

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
