# Task

This branch is pull request #{{PULL_REQUEST}}, implementing issue #{{TICKET}}:

!`gh issue view {{TICKET}} --json number,title,body`

The harness ran `git rebase origin/main` and it stopped on conflicts. Finish the
rebase.

For each conflicted file, read the commits on `origin/main` that touched it since
this branch forked (`git log origin/main --oneline -- <file>` and `git show`), so
you know what main meant as well as what this branch meant. Resolve so that both
survive: main's change is already merged and reviewed, and this branch's intent is
the ticket. Where main renamed or replaced something this branch still uses, move
this branch onto main's version rather than restoring the old one.

A clean text merge can still be wrong. Before each `git rebase --continue`, grep
for names main renamed or removed that the rest of this branch still uses, and fix
them in the same commit. For `pnpm-lock.yaml`, take main's and run `pnpm install`;
for `.po` catalogs, resolve the entries and let the gates catch drift.

Continue until `git status` shows no rebase in progress. The harness re-runs the
full gate suite afterwards, so do not run it yourself.

Never run `git worktree` — add, remove or prune. The registry you would write to is the host's,
shared with every other checkout on that machine, and your own worktree's path does not resolve
from in here, so prune reads every one of them as gone.

If the two sides cannot both survive — main made a decision that contradicts the
ticket — run `git rebase --abort` and emit the block below. The harness stops there
and hands your reason to a human: say which main commit contradicts which part of
the ticket.

<declined>
one or two paragraphs, or nothing at all if the rebase finished
</declined>

# Done

<promise>COMPLETE</promise>
