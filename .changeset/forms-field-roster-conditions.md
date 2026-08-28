---
"@plumix/plugin-forms": minor
"@plumix/core": minor
"plumix": minor
---

Widens a form's field roster to the v1 set and teaches it fields that only sometimes apply.

Alongside `text` and `email`, a form now takes `textarea`, `url`, `number`, `date`, `select` and
`toggle` from `plumix/fields`, plus `tel` from `@plumix/plugin-forms/fields`. Each renders the
control its answer needs and stores that answer in the shape the field declares — a `number` as a
number, a `toggle` as a boolean, a `select` as one of the options the form offered. An answer the
visitor never gave is absent rather than empty — except from the two controls that always answer,
where an unticked checkbox is `false` and an unmade multiple choice is an empty list. So
`FormAnswersOf<typeof yourForm>` is what a submission actually holds, and renaming a field breaks
the build at its readers rather than in production.

`tel` is the plugin's own contribution to the field vocabulary rather than a core built-in: it
registers through `registerFieldType` and ships the admin renderer for it, so a `tel` field works
anywhere a field does, meta boxes included. Making that possible without restating core's whole
string chain is the one change in core — `StringMetaBoxField` and `StringFieldBuilder` are no
longer bound to the five built-in string inputs, so a plugin contributing a string-shaped input
reuses both. The built-in roster is unchanged, and such a field lands in the union exactly where a
plugin-registered type already did.

A field can now name a condition on a sibling, exactly as it would in a meta box:

```ts
const plan = select("plan").options(["basic", "pro"]);
const signup = defineForm("signup", {
  fields: [plan, number("seats").visibleWhen(plan.is("pro"))],
});
```

Core's own `isFieldVisible` judges it on both sides, and both judge a bag built the same way, so an
untouched form is read exactly as it was served: the markup leaves out a field the form's defaults
hide, and the submit handler drops one the submitted answers hide. A hidden field therefore never
reaches the stored payload — nor the label snapshot — and is never held to its own `required`,
even when something posts a value for it anyway. What the answers _reveal_ is kept, which is what
will let a visitor whose script showed them a further question have its answer stored.

`defineForm` now also runs the field checks a `register*MetaBox` call runs, published from core as
`assertMetaBoxFields` beside the compile and projection pair it completes. A form is not
registered, so nothing else was running them, and each one it skipped failed silently at submit
instead: a field keyed `__plumix_hp` shadowed the honeypot and filed every answer as spam, two
fields claiming one key dropped one of the two answers, and a condition naming a field the form
does not declare hid its own field for good.
