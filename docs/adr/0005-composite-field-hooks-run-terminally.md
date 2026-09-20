# A composite field's own hooks run last, over the value that will be stored

`group` and `repeater` are composite fields: their value is assembled from
declared sub-fields rather than stored directly. Until now neither offered
`.validate()` or `.sanitize()`, so a cross-row uniqueness rule or a
cross-member consistency check had to abandon the fluent builder and hand-write
a field object. The two methods were declared on the shared field base all
along and the manifest already dropped them as server-only — what was missing
was a place in the write pipeline for them to run, because the pipeline
dispatched into its group and repeater branches and returned from them before
the stage that reads the callbacks.

The hooks are **terminal**. Sub-field recursion happens first; the parent
callbacks see the assembled value that would otherwise have been stored, and
only when nothing below produced an error. A cross-row rule over rows that
might individually be invalid is a rule over garbage, and a hook placed before
recursion would see un-coerced input where a cell can still be a `Date` or a
hydrated reference payload. For the same reason both callbacks are typed
against the field's **stored** shape, not its read shape: inside the write
pipeline a reference member is a bare id and a temporal member an ISO string,
so typing them as the hydrated summaries a read returns would hand the author a
signature the runtime never honours.

A sanitizer's output is re-settled, not trusted and not fully re-validated.
Cells are walked again in `draft` mode — which is precisely the codebase's
existing split between the gates that always bind and the rules that a
work-in-progress may fail. So the safe-href check and the rich-text allowlist
re-run over whatever the callback produced, while `maxLength`, option
membership and the cells' own `.validate()` do not. The blank-row strip re-runs
over the output, so a sanitizer cannot reintroduce a row the strip would have
removed, and the count bounds are judged on what the callback returned rather
than on what it was given — which lets a sanitizer trim to `.max()` or pad to
`.min()`, while still rejecting a de-dupe that cut below `.min()`. A composite
that sanitizes down to nothing clears the field, the same deletion an author
gets by emptying it by hand.

Because a reorder or a de-dupe moves every row, cell errors raised on the
re-settled output anchor on the composite itself rather than on a row index: a
post-sanitize position no longer names anything the author's form rendered, so
pointing at one would highlight the wrong row.

That last point made one existing behaviour inconsistent enough to change: an
all-blank group had always been dropped as a deletion, while a repeater emptied
to zero rows stored `[]`. The repeater now deletes too — but the short-circuit
sits _after_ the count bounds, because `.min()` binds an optional field and
deleting first would silently discard a declared constraint.

## Considered options

- **Wrapping hooks, running before recursion** (rejected). The callback would
  receive raw input and have to redo the pipeline's own coercion to read it.
- **Interleaved hooks, running even when cells failed** (rejected). It lets a
  parent add errors, at the cost of every parent callback needing to defend
  against cells it cannot trust.
- **Trusting the sanitizer's output outright** (rejected). It is how a composite
  sanitizer becomes a way to write a `javascript:` URL into a `url` member that
  the bare field could never have accepted.
- **Re-walking cells in strict mode** (rejected). It doubles the walk and makes
  a sanitizer that legitimately drops a member fail the member's own
  `.required()`.
