# An autosave stores the author's edits, not a copy of the row

The glossary has always defined an autosave as "a per-user pending draft of
_edits_ to a published entry". The implementation stored a full copy of the live
row instead, and every draft write rebased that copy. The gap between those two
sentences is not cosmetic: a copy cannot say which keys the author touched, and
two behaviours that both depend on that answer had to be built without it.

Publishing promotes the autosave bag through the write path's strict pass. That
is correct for a key the author edited — an autosave is written draft-lenient, so
publish is the first strict validation the value ever gets, and re-running a
field's `sanitize` over a draft written before the sanitizer changed is behaviour
this project chose deliberately. It is wrong for a key that was only ever copied
off the live row, which is already settled: re-running an **input** decoder over
it re-interprets a value nobody submitted.

That is how publishing an unrelated edit came to turn on a flag the author never
touched and the admin displayed as off (#2428). The write path accepts `1` for a
`boolean` field and settles it to `true`; reads answer from the value as stored
(#2424). A row holding an unsettled `1` therefore reads as off everywhere, until
a publish drags it back through the input decoder and settles it.

> **An autosave's meta column holds the keys the author touched. Promotion runs
> the field pipeline over those keys and no others.**

Provenance becomes structural. The write path already knows which keys the
author supplied — it builds a `MetaPatch` of upserts and deletes on every draft
write — and the change is to store that patch rather than apply it to a copy and
throw it away.

## Considered options

- **Record touched keys beside the copy** (rejected). A `touched` list in the
  snapshot envelope answers the question at promotion time without changing what
  the column holds. It is parallel bookkeeping that can disagree with the bag it
  describes, and it leaves the glossary contradiction in place for the next
  person to trip over.
- **Compare against the live row at promotion time** (rejected). Skip the
  pipeline for any key byte-identical to live. No storage change and no reader
  change, but it re-derives on every publish something the write path knew for
  certain and discarded — and it can only ever infer provenance, never know it.
- **Stop promoting through the pipeline at all** (rejected). This is what
  `entry.update` does when a status transition crosses into the live surface: it
  runs the same whole-bag gate purely to validate and discards the result. The
  symmetry is tempting and wrong — that path promotes already-settled storage,
  while an autosave bag carries genuinely unvalidated draft input that has to be
  settled somewhere.
- **Reject a publish over an unsettled value** (rejected). The strict gate exists
  to reject invalid input, and an unsettled value is not invalid — it is valid
  input that was never submitted. Rejecting would make an imported archive
  un-publishable over fields no author can see as wrong, since they display as
  unset.

## Consequences

- An unsettled value survives a publish it was not part of. Storage no longer
  self-heals as a side effect of unrelated edits, so settling a legacy field
  becomes a deliberate operation rather than something that happens eventually to
  the rows that happen to get republished.
- The same narrowing reaches past unsettled values: a field absent from the bag
  and absent from the patch no longer picks up whatever its pipeline would have
  produced for it. Promotion writes what the author wrote, so a default now
  arrives when someone edits the field, not when someone publishes the row.
- The columns snapshot while the meta bag patches. `content` and `excerpt` carry
  the same copied-from-live values, but nothing re-decodes them on promotion, so
  nothing can silently rewrite them — and "null means untouched" would collide
  with columns that are legitimately nullable. The asymmetry is the decision, not
  an unfinished migration.
- A patch has to say what a copy said by omission. Absence means untouched, so a
  field the author cleared is carried explicitly; the snapshot envelope holds the
  deletions. This reaches further than the meta-box fields: the framework's own
  template and access picks ride into a draft outside the validated patch and
  used to be cleared by deleting the key, which now reads as "not edited". So
  does restoring a revision, where a key the live row gained after the snapshot
  has to be named rather than merely left out.
- `getAutosave` keeps returning a whole draft row, merged over live, so the
  surfaces that render a draft keep asking the same question; only the write path
  reaches for the patch, and the new concept does not reach the published API. It
  takes the live row as an optional argument, typed as the stored row on purpose
  — a caller holding one whose meta is already resolved has to omit it, or
  hydrated values would be laid under the edits and promoted back as storage.
