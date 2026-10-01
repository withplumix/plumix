# Ticket

Issue **#{{TICKET}}** in `withplumix/plumix`:

!`gh issue view {{TICKET}} --json number,title,body,labels,comments`

# Task

Implement it and commit. You do not push, open a PR, or merge — the harness does
that from what you write below.

1. **Read before designing.** The ticket, its parent, `GLOSSARY.md`, and any ADR in
   the area. When the change is consumed in more than one place (server, admin,
   editor, a second bundle), find out how each consumer gets it today.
2. **Implement with `mattpocock-skills:tdd`.** The acceptance criteria are the
   behaviours, in order, one RED then GREEN per cycle. The interfaces the ticket
   names are the agreed seams; there is no one to confirm them with.
3. **Changeset** if a consumer of a published package would notice. AGENTS.md says
   which package and which bump. The harness's changeset gate also wants a file in
   `.changeset/` whenever a published package's files change at all; when nothing
   is released, add an empty one (frontmatter only).
   **ADR**, if the work records one: use the number the ticket names. If it names
   none, use **{{NEXT_ADR}}**. Main, every open pull request and every open issue
   were checked for it, and no other lane of this run holds it, so do not pick a
   number of your own.
4. **Commit** by the rules in AGENTS.md's "Commits, branches, PRs". Use
   `Fixes #{{TICKET}}` when every criterion is met, otherwise `Refs #{{TICKET}}`.

Do not run the full gate suite yourself. The harness runs format, test, e2e, i18n,
knip and the changeset check after this phase and hands you any failure. Lint,
typecheck, publint and attw run only in CI, after the pull request opens, so run
single test files and a targeted typecheck and lint of the packages you touch as
you work.

Commit on the branch you are on. Never create, switch or rename a branch, even when the
ticket names one: the harness owns this branch, and a commit anywhere else never reaches the
pull request.

Never run `git worktree` — add, remove or prune. The registry you would write to is the host's,
shared with every other checkout on that machine, and your own worktree's path does not resolve
from in here, so prune reads every one of them as gone. Compare against `origin/main` with
`git diff` and `git log` instead.

You are unattended: there is no user to ask. Where the ticket cannot be built from
here — it needs a decision only a human can make, or it depends on work that has
not landed — emit the block below and commit nothing. The harness stops there and
hands your reason to a human, so write it for them: what you checked, what blocks
it, and what would unblock it.

<declined>
one or two paragraphs, or nothing at all if you are committing the work
</declined>

# Done

End with the PR copy the harness will use. Everything between `body:` and the
closing tag becomes the PR description verbatim. Lead with
`**Fixes #{{TICKET}}**`, then write the body with `mattpocock-skills:pr`: its
Evidence is the test you watched fail and then pass. After it, give the
acceptance criteria as a ticked checklist, and name anything you deferred,
could not meet, or noticed as out of scope.

<pr>
title: <conventional-commit subject, lowercase after the colon>
body:
**Fixes #{{TICKET}}**

...
</pr>

<promise>COMPLETE</promise>
