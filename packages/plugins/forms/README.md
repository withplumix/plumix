# @plumix/plugin-forms

This Plumix plugin adds **forms declared in your repository** — a contact page, a
newsletter signup, an enquiry form — rendered as a block and stored as rows you
can read back.

A form is a value in your code, not a row in a database. It deploys with the
code that renders it, diffs in review, and reverts with `git revert`, so local,
staging and production cannot drift apart. There is no builder, no export
format, and nothing to migrate between environments.

> This release covers the v1 field roster and conditional visibility. A
> submission is otherwise stored as it arrived — `required` renders as an HTML
> attribute but is not yet enforced on the server, and neither is email format.
> Validation callbacks, repeater and group fields, multi-step forms, the inbox
> and export arrive next.

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

The slug is the form's identity. Submissions carry it and nothing else links
them back, so renaming a form orphans its history. Two forms claiming one slug
fail at boot, naming both contributors.

## Placing it on a page

The plugin registers a `forms/form` block. An editor inserts it and picks a
form from the ones that exist; nothing else needs wiring.

The block server-renders static markup — the same bytes for every visitor, so
the page carrying it stays edge-cacheable — and it submits as a plain HTML
`POST` with no JavaScript on the page at all.

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

| Part          | Class                 | Attribute                          |
| ------------- | --------------------- | ---------------------------------- |
| The form      | `plumix-form`         | `data-plumix-form="<slug>"`        |
| Title         | `plumix-form-title`   | `data-plumix-form-title`           |
| Field wrapper | `plumix-form-field`   | `data-plumix-form-field="<key>"`   |
| Label         | `plumix-form-label`   | `data-plumix-form-label`           |
| Control       | `plumix-form-control` | `data-plumix-form-control="<key>"` |
| Actions       | `plumix-form-actions` | `data-plumix-form-actions`         |
| Submit button | `plumix-form-submit`  | `data-plumix-form-submit`          |

The one exception is the honeypot, hidden inline: a trap the visitor can see is
a trap they fill in.

## What gets stored

Each submission is a row in `form_submissions`: the form's slug, a per-form
serial you can quote to whoever sent it, the answers, and a snapshot of what
every field and option was called at the time. That snapshot is what keeps the
row readable after the form changes — without it a renamed field reads as a raw
key.

The visitor's IP address is stored only as a salted SHA-256, against a
per-install salt minted on the first submission. Cleartext addresses are never
written.

A submission that fills the honeypot is answered exactly like a real one and
stored with `spam` status — held rather than discarded, so a false positive
stays recoverable. The trap's field name is the same on every Plumix site, so
it stops undirected bots rather than one aimed at you; the request body is
capped, and flood protection belongs at your edge (a Cloudflare WAF rule) where
it beats counting rows.
