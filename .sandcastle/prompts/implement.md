# Ticket

Issue **#{{TICKET}}** in `withplumix/plumix`:

!`gh issue view {{TICKET}} --json number,title,body,labels,comments`

# Task

Implement it and commit. You do not push, open a PR, or merge — the harness does
that from what you write below.

1. **Read before designing.** The ticket, its parent, `CONTEXT.md`, and any ADR in
   the area. When the change is consumed in more than one place (server, admin,
   editor, a second bundle), find out how each consumer gets it today.
2. **Implement with `mattpocock-skills:tdd`.** The acceptance criteria are the
   behaviours, in order, one RED then GREEN per cycle.
3. **Changeset** if a consumer of a published package would notice. AGENTS.md says
   which package and which bump.
4. **Commit** with `sentry-skills:commit`. Use `Fixes #{{TICKET}}` when every
   criterion is met, otherwise `Refs #{{TICKET}}`.

Do not run the full gate suite yourself. The harness runs typecheck, lint, format,
test, i18n, knip, publint, attw and the changeset check after this phase and hands
you any failure. Run single test files and targeted typechecks as you work.

You are unattended: there is no user to ask. If the ticket needs a decision only a
human can make, say so in your final message and stop.

# Done

End with the PR copy the harness will use. Everything between `body:` and the
closing tag becomes the PR description verbatim, so write it for a reviewer: lead
with `**Fixes #{{TICKET}}**`, give the acceptance criteria as a ticked checklist,
and name anything you deferred, could not meet, or noticed as out of scope.

<pr>
title: <conventional-commit subject, lowercase after the colon>
body:
**Fixes #{{TICKET}}**

...
</pr>

<promise>COMPLETE</promise>
