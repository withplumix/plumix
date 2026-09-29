# Task

Close every item below on the branch you are on, then commit.

{{FINDINGS}}

Each is a cycle: where it is a behaviour, a failing test first, then the fix. Use
`mattpocock-skills:tdd`.

If an item cannot be closed from here — it is wrong, it needs a decision that is
not yours, or the failure is in the environment rather than the code — do not
force a change that hides it. Close and commit every other item anyway, then emit
the block below for the ones you could not close. A fix that is ready is never
held back because another item is declined. The harness hands your reason to a
human, so write it for them: what you checked, why the code cannot fix it, and
what would.

<declined>
one or two paragraphs on the items you could not close, or nothing if you closed them all
</declined>

If you changed nothing because the failure is not this branch's — you reproduced
it on `origin/main`, or its evidence shows it failing on another pull request that
does not share this change — emit this block instead of `<declined>`, with that
evidence. The harness re-runs the failed jobs rather than handing the ticket to a
person.

<not-this-branch>
what fails, where you saw it fail without this branch, and why this diff cannot cause it
</not-this-branch>

Never run `git worktree` — add, remove or prune. The registry you would write to is the host's,
shared with every other checkout on that machine, and your own worktree's path does not resolve
from in here, so prune reads every one of them as gone. Compare against `origin/main` with
`git diff` and `git log` instead.

The harness re-runs the full gate suite after this phase, so do not run it yourself.

# Done

<promise>COMPLETE</promise>
