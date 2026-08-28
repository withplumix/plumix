---
"@plumix/core": minor
"@plumix/admin": minor
---

Lets a condition apply inside a repeater row or a group, judged against that row's or group's own
values.

`.visibleWhen()` was refused on a sub-field at registration, because nothing evaluated it one scope
down: the admin rendered every sub-field regardless, and the write pipeline validated every cell. A
row whose `kind` decides which siblings apply had to show all of them at once — a row of kind
"Text" offering the "Choices" list that belongs to "Dropdown".

Both evaluators now read the row's or group's own bag, so `repeater("fields").fields([kind,
text("choices").visibleWhen(kind.is("select"))])` registers and behaves the way the same chain does
on a box's fields: the admin shows and hides sub-fields live as the author changes the driver, and
sibling rows never speak for each other. Registration still refuses a rule that names anything
other than a sibling — a row cannot read a box-level key, so such a rule could never pass — and
`sub_field_condition_unknown_driver` reports that mistake in place of the removed
`sub_field_condition_not_supported`.

On save a hidden cell runs under the same rules a draft does. Business constraints cannot fail on
it, so a `.required()` sub-field behind a false condition can no longer block a publish with an
error pointing at an input nobody can open; coercion, `.sanitize()` and the safety gates still run,
and the value itself is kept. Keeping it matters more here than at box level, where a hidden key's
stored value is simply left alone: a row is rewritten whole on every save, so a cell dropped once
would be gone for good — including on a publish that re-runs rows the author never touched.

Visibility inside a row reads an absent driver key as unset rather than unknown, which is what the
admin does when it renders the same row. The box-level rule differs on purpose: a patch there may
legitimately omit a driver, while a row is always written complete.
