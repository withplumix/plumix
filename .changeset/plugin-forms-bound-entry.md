---
"@plumix/plugin-forms": minor
"plumix": minor
---

A form can now declare `bind` and carry the row whose page it was rendered on — an `entry`, a
`term` or an `author` — so a subscribe form on a school's page knows which school without a
developer threading an id through the block, the template or the theme.

```ts
const subscribe = defineForm("subscribe", {
  bind: "entry",
  fields: [email("email").required()],
  onSubmit: ({ bound, answers }) => enrol(bound?.id ?? null, answers.email),
});
```

The value is resolved on the server at render, from the row the URL already matched, so binding
costs no second lookup. It travels as a signed token — the kind, the id, and an HMAC over both
_and_ this form — under a per-install secret generated on first use and kept in the settings table,
so there is no environment variable and no binding to configure. Every other form system carries
the bound value in a plain hidden input, one devtools edit from submitting against a different
row; here the value and its signature travel together and the server reads the value back only out
of a token it signed. Edit any part and the submission is refused, as is a token minted for one
form and replayed against another, or one whose kind was rewritten — the slug and the kind are
both inside what was signed, so entry 7's token cannot be posted as term 7.

The verified `bound` reaches `validate` and `onSubmit` as `{ type, id }`, and is stored in the new
indexed `bound_type` / `bound_id` columns rather than among the answers, so every submission for
one row is a query rather than a scan — **run `plumix migrate generate` after upgrading**. Both
columns are asked for together, because ids are unique only within their own table and because the
index is partial: a query on `bound_type` alone falls back to a scan.

```ts
const enquiries = await ctx.db
  .select()
  .from(formSubmissions)
  .where(
    and(
      eq(formSubmissions.boundType, "entry"),
      eq(formSubmissions.boundId, school.id),
    ),
  );
```

The token is about the page rather than the visitor, so two renders of one page produce the same
bytes and a page carrying a bound form stays edge-cacheable; for the same reason it does not
expire, and the columns carry no foreign key, so a submission outlives the row it names.

A bound form placed on a page of any other kind carries no token and stores nothing — a front
page, a footer, an archive, a synced pattern, and equally a term page under a form that asked for
an entry. Changing a form's `bind` has the same effect on pages the edge is still serving from
before the change: the old token verifies, but its kind is no longer the one the form asks for, so
the submission is accepted and stores nothing rather than handing a handler the wrong kind of id.
Read `bound` as optional wherever the same form appears in more than one place.

`plumix/blocks` gains the `BlockLoaderArgs` and `MaterializedAttrs` types, which a plugin
declaring a block loader could not previously name.
