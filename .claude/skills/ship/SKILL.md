---
name: ship
description: Take a ready-for-agent ticket, or a PRD with tickets, from issue to merged PR unattended. Use only on an issue the user named.
argument-hint: "<issue url or number>"
---

# Ship

One invocation, start to finish. Do not return to the user between steps and do not ask them
to confirm a step. Stages 1 to 3 already turned every open question into the ticket, so its
acceptance criteria are the agreed behaviours. The only reasons to stop early are listed
under **Blocked**.

## Resolve the argument

```bash
gh issue view <N> --json number,title,state,labels,assignees,body,comments
gh api repos/{owner}/{repo}/issues/<N>/sub_issues --jq 'map({number,state})'
```

- Labelled `wayfinder:map`. Stop. A map is worked with `/mattpocock-skills:wayfinder`.
- Has sub-issues. Use **PRD mode**.
- No sub-issues and labelled `ready-for-agent`. Use **Ticket mode**.
- Anything else. Stop and say whether it still needs `to-tickets` or `triage`.

Never take an issue number from a branch or worktree name.

## Ticket mode

1. **Claim.** If nobody is assigned, run `gh issue edit <N> --add-assignee @me`. If someone
   else is, stop. Every issue listed under `issues/<N>/dependencies/blocked_by` must be
   closed. If the branch name contains "claude", rename it with
   `git branch -m <type>/<short-desc>`.
2. **Read before designing.** The ticket, its parent, `CONTEXT.md`, and any ADR in the area.
   When the change is consumed in more than one place (server, admin, editor, a second
   bundle), find out how each consumer gets it today before you design.
3. **Implement** with `mattpocock-skills:tdd`. The behaviours are the acceptance criteria, in
   order, one RED then GREEN per cycle. Do not ask the user to confirm them.
4. **Review the work in progress.** Once the shape is real and the first cycles pass, send
   both reviewers in one message, in parallel, and keep working while they run. One is an
   agent that loads `sentry-skills:code-review` and reviews `git diff origin/main`, findings
   only, told that files may change under it. The other is the `sentry-skills:code-simplifier`
   agent on the touched files. Every finding becomes a new cycle. Run the pair again before the
   final commit, and again for any follow-up commit.
5. **Spec review.** Run `mattpocock-skills:code-review` against `origin/main`. Its Spec axis
   reads the issue. Close every gap as a cycle. Name any criterion you could not meet in the
   PR body.
6. **Changeset** if a consumer of a published package would notice. AGENTS.md says which
   package and which bump.
7. **Commit** with `sentry-skills:commit`. Use `Fixes #<N>` when every criterion is met,
   otherwise `Refs #<N>`.
8. **Push and PR.** Run the checks AGENTS.md lists before committing, plus `pnpm knip` and
   `pnpm i18n:check`. Add `pnpm test:e2e` when the change touches admin, render or e2e paths.
   Push, then run `sentry-skills:pr-writer` and put the acceptance criteria in the body as a
   ticked checklist.
9. **Merge.** Run `gh pr merge <PR> --squash --auto`. The message "set by the merge queue" means
   the queue accepted it. Wait with the Monitor tool or a ScheduleWakeup every few minutes.
   A failing check: fix it as cycles, reviewers included, and push. `BLOCKED` with green
   checks: an unresolved review thread, resolve it. `CONFLICTING`: rebase on `origin/main`,
   push with `--force-with-lease=refs/heads/<branch>:<sha>`, queue again.
10. **After the merge.** Confirm the issue closed. If every sub-issue of the parent is now
    closed, close the parent with a comment listing the PRs. Run `git fetch -p origin` and
    delete local branches merged into `origin/main`. Anything out of scope that came up
    becomes one `needs-triage` issue in the to-tickets shape, never a "fix later" comment.
11. **Report** the PR link, what you verified, and anything you deferred.

## PRD mode

You orchestrate. You do not implement. One ticket at a time.

1. The frontier is the open sub-issues that are unassigned and have
   `issue_dependencies_summary.blocked_by` equal to 0. Take the lowest number. If the frontier
   is empty but open children remain, stop and say what blocks them.
2. Spawn one Agent for that ticket with `subagent_type: general-purpose`,
   `isolation: worktree`, `run_in_background: false`, and `model` from the ticket's `model:`
   label, `opus` when it has none. The prompt gives the ticket URL and says: invoke the `ship`
   skill on it in ticket mode, unattended; you cannot ask the user anything, so a question
   only a human can answer means the skill's Blocked section; end with `MERGED: <pr url>` or
   `BLOCKED: <one line>`, then `WORKTREE: <absolute path>`.
3. When it returns, confirm with `gh` that the PR merged and the ticket closed. If either is
   false, comment the worker's report on the ticket, unassign it, remove its worktree with
   `git worktree remove`, and stop the loop, because later tickets may depend on this one.
4. On success, remove the worker's worktree, run `git fetch origin main`, and go to 1.
5. When no open sub-issues remain, close the PRD with a comment listing every PR, and report.

## Blocked

Stop when the brief needs a decision only a human can make, when a blocker is still open, when
the ticket belongs to someone else, or when a check fails for a reason outside the ticket
after one honest retry. Comment the exact question on the issue, swap `ready-for-agent` for
`needs-triage`, and report. Never answer a human question by choosing for the user.
