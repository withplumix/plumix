---
"@plumix/plugin-forms": minor
"plumix": minor
---

A form can now declare `bind: "entry"` and carry the entry whose page it was rendered on, so a
subscribe form on a school's page knows which school without a developer threading an id through
the block, the template or the theme.

```ts
const subscribe = defineForm("subscribe", {
  bind: "entry",
  fields: [email("email").required()],
  onSubmit: ({ entryId, answers }) => enrol(entryId, answers.email),
});
```

The value is resolved on the server at render, from the entry the URL already matched, so binding
costs no second lookup. It travels as a signed token — the entry and an HMAC over that entry _and_
this form — under a per-install secret generated on first use and kept in the settings table, so
there is no environment variable and no binding to configure. Every other form system carries the
bound value in a plain hidden input, one devtools edit from submitting against a different entry;
here the value and its signature travel together and the server reads the value back only out of a
token it signed. Edit either half and the submission is refused, as is a token minted for one form
and replayed against another, since the form's slug is inside what was signed.

The verified entry reaches `validate` and `onSubmit`, and is stored in a new indexed `entry_id`
column rather than among the answers, so every submission for one entry is a query rather than a
scan — **run `plumix migrate generate` after upgrading**. The token is about the page rather than
the visitor, so two renders of one page produce the same bytes and a page carrying a bound form
stays edge-cacheable; for the same reason it does not expire, and the column carries no foreign
key, so a submission outlives the entry it names.

A bound form placed where there is no entry to bind — a front page, a footer, an archive, a synced
pattern — carries no token and stores no entry, so read `entryId` as optional wherever the same
form appears in more than one place.

`plumix/blocks` gains the `BlockLoaderArgs` and `MaterializedAttrs` types, which a plugin
declaring a block loader could not previously name.
