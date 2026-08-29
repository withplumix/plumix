---
"@plumix/plugin-forms": minor
---

Adds repeater and group fields to a form: as many rows as the visitor has things to say, and
related questions namespaced under one key.

```ts
const vegetarian = toggle("vegetarian");

const rsvp = defineForm("rsvp", {
  fields: [
    group("contact").fields([text("name").required(), tel("phone")]),
    repeater("attendees")
      .fields([
        text("who").required(),
        vegetarian,
        text("dietary").visibleWhen(vegetarian.isOn()),
      ])
      .max(6),
  ],
});
```

Both are core's own builders, so a submission still types itself: that form stores
`{ contact: { name }, attendees: [{ who, vegetarian, dietary? }] }`, and `FormAnswersOf` says so.
They compose — a group inside a row, a repeater inside a group — and nothing about them is a
premium add-on.

A rule inside a row is judged against **that row's** answers rather than the whole form's, on the
server exactly as in the markup, so one attendee's dietary note appears because that attendee is
vegetarian and not because their neighbour is — and a sub-field the row hid is absent from that
row's stored values however the body was written. A row nobody filled in is dropped rather than
stored blank and is asked nothing, `.required()` sub-fields included; `.min()` and `.required()`
therefore count the rows the visitor actually used, while `.max()` counts the rows that came back
at all, since the form never renders more than it takes and a body that carries more is refused
rather than read as far as the cap. A repeater declaring no `.max()` still has one — 100 rows,
because the request body is the visitor's to write.

Nested fields post under a bracketed name (`contact[name]`, `attendees[0][who]`), which is what an
error names, what the summary links to, and what the `data-plumix-form-*` attributes carry. Rows
are `<fieldset>`s with their own legend, and each carries one hidden marker — a repeater posts no
value of its own, so the markers are how the handler counts the rows that came back. The label
snapshot nests the same way, so a stored row stays readable after the form changes.

With JavaScript the visitor adds and removes rows in place, keyed so that removing the row in the
middle takes that row's answers with it and leaves its neighbours' where they are, and focus moves
to the add button rather than being dropped with the row. Without it the form is served with the
fewest rows the repeater accepts, and never fewer than one; a row past that floor carries no
browser-side `required`, since the server asks a blank row nothing and a browser refusing to
submit over a row nobody has to fill would strand a visitor who has no other way through.
