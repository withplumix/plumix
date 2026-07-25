---
"@plumix/core": minor
"@plumix/admin": patch
---

Validate entry meta leniently on draft saves and strictly on publish, so
work-in-progress never fails to save while published content stays valid.

The field pipeline gains a `draft` / `strict` mode. In `draft` mode the
business-rule constraints — required, numeric / temporal bounds, `maxLength`,
option membership, format checks, repeater / group row counts, and
`.validate()` — are skipped; the structural + security gates (type coercion,
shape normalization, `.sanitize()`, temporal validity, and the url safe-href
check) always run, so a draft can never persist corrupt or unsafe data.

Autosaves and draft-status writes use `draft`; anything that lands the entry
as published or scheduled uses `strict`. Publishing re-validates the **whole**
promoted bag against the full field list — catching a required field the
draft left absent, not only one stored empty — and a violation aborts the
publish with a per-field `CONFLICT` the admin pins onto its inputs. Fields the
publisher lacks the capability to write are excluded from that gate, so a
co-author's value can't block an unrelated publish.

This reverses the previous behavior where autosave rejected incomplete content
(the recurring "Couldn't save your changes — they may contain invalid content"
failure while editing) and publish promoted a stored bag without re-checking
its constraints.
