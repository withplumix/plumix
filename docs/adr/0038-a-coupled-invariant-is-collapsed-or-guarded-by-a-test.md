# A coupled invariant is collapsed or guarded by a test

The #2297 audit named "invariants copied between files and coupled by comments"
as cause 7 of its findings. Nine plugins shipped a byte-identical i18n literal,
seven hardcoded their own install path, and three D1 cap constants held two
values. Each copy carried a "Mirrors …" or "keep in sync" comment, and nothing
read it. #2312 and #2456 collapsed a few of them, one at a time, while new ones
kept arriving.

> **A comment that claims a coupling ("mirrors", "keep … in sync", "kept in
> sync", "must match", "must stay in step") names the test that fails when the
> coupling breaks, with `Guarded by: <repo-relative test path>` on one of its
> lines. The `plumix/sync-comment-guarded` lint rule enforces it, and checks
> that the path exists and is a test file.**

## What this means

- **Collapse first.** Two copies of one fact are one fact too many. Derive one
  from the other, or move both behind one export, and the comment goes with
  the duplicate.
- **Bind with a test second.** When the copies cannot be collapsed (a value a
  build tool reads, a contract across a published boundary), write a test that
  fails when they drift and name it in `Guarded by:`.
- **Reword prose.** "Mirrors" often describes a resemblance, not an invariant.
  Such a comment is reworded so it claims no coupling.
- **A baseline holds today's occurrences.** `tooling/eslint/sync-comment-baseline.json`
  lists each unguarded occurrence as its file and a hash of its line's text.
  The rule skips exactly those, so a new comment is held to the rule at once.
  The package's `sync-baseline` script regenerates the file and refuses to
  grow it, and CI's Lint job fails when an entry no longer matches its file,
  so each burn-down slice removes its entries in the same change. The pattern
  is the one #2722 used to take `@shadcn/lint` to zero.
- **The false-positive bar.** A `plumix/*` rule ships only when, once the
  genuine violations are fixed or baselined, it has zero hits on the tree. The
  only escapes are the named ones a rule defines (`// Safety:`, `Not JSON:`,
  `Guarded by:`), never a disable comment.

## Considered options

- **Ban the phrases.** Rejected: an honest comment would be reworded to dodge
  the rule, and the coupling would stay, now invisible.
- **Leave it to review.** Rejected: that is how the audit found the couplings,
  and review missed every one of them as it landed.

## Consequences

- The rule reads comments in TypeScript files only. A coupling claimed in
  Markdown, CSS or a `.mjs` script is outside it.
- The rule checks that the named test exists, not that it binds the coupling.
  Review still asks whether the test would fail when the copies drift.
