# A field default is the starting value of a new entity

`.default()` used to be a fallback applied on read. The meta decode, `settings.get`
and the bag that conditions are judged against each filled a key that storage
lacked with the field's default. Clearing a field sends `null` or an empty group or
repeater, and the field pipeline turns that into a deletion, so the next read
filled the default back in and the next save wrote it (#2519). Every field
type whose clear deletes was affected: number, date and time, link, json,
single reference and media, group and repeater.

The readers also disagreed. Search indexing, `whereMeta` rule selectors, image
roles and the publish gate's required check read storage alone and never saw a
default, so a page could render a value that search could not find. The admin
seeded in two different ways: the term, user and settings forms wrote every
default on their first save, and the entry editor never did.

> **A field default is the value a new entity starts with. Core writes it into
> the entity's meta when the entity is created, through one function,
> `startingMeta(fields)`. Nothing fills a default in on read, so from creation
> on, storage alone holds a field's value, and a field the author cleared stays
> empty. Whether a field may be empty is decided by `.required()`, not by
> having a default.**

## What this means

- **`.required()` and `.default()` split.** `.required()` alone narrows the
  read type. `.default()` no longer narrows it for any field type:
  `text().default("x")` reads as `string | undefined`, and
  `text().required().default("x")` reads as `string`. `InferFields` narrows on
  `.required()` only. `InferStoredFields` is unchanged.
- **Every creation path calls `startingMeta`.** Entry and term create, user
  invite, sign-up through passkey, OAuth, magic link and Cloudflare Access (the
  first admin included), and the media and menu plugins' direct inserts. Core
  hands a `RequestAuthenticator` the plugin registry so one that provisions
  users can do this. Meta the caller sends overlays the starting meta, and a
  `null` for a defaulted key leaves it absent. Duplicating an entry and
  restoring a revision copy existing meta and apply no defaults.
- **Composite defaults are assembled.** A group's starting value is its own
  `.default()` if it has one, otherwise its members' starting values, and
  otherwise nothing. Each row in a repeater's `.default([...])` is completed
  with the subfield defaults when the field is declared, the same way a row
  added in the admin starts. A row or group written over the API without some
  keys is stored as sent.
- **Every reader sees the same value.** The page, REST, feeds, conditions, the
  publish gate, search, rule selectors and image roles all read storage, so
  they agree. The admin forms seed what is stored and nothing else.
- **A settings group is created on its first save.** Until then
  `settings.get` answers with its fields' starting values laid under whatever
  is stored. The first save writes every field, filling unsent keys that are
  not stored with their starting values, plus a reserved `__plumix_created`
  row. After that, storage is the truth. Only the marker counts: a group saved
  before this decision, or written without the form, has rows but no marker,
  so until its next save a setting cleared there reads its default again, and
  that save stores it. The marker row never appears in a settings read.
- **No backfill.** An entity that existed before a field gained its default
  stays empty for that field. The field docs give the one-line SQL that fills
  it, and so does the release note.

## Considered options

- **Keep the read-time fallback and store a tombstone for a clear**, such as a
  `null` or an empty group or list. The seed could then tell "never authored"
  from "cleared". But a group has never stored `{}` for a clear, a stored `[]`
  cannot be told apart from a list an importer wrote, and search, rule
  selectors and the publish gate would still disagree with the page about
  every key nobody had saved.
- **A backfill command** that writes a new default into every existing entity.
  It decides for the site owner that old content should change, runs over
  every row on every default change, and has no good answer for a cleared
  field on an old row. One SQL statement, run when the owner wants it, does
  the same job.
