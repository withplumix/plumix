# Task

Close every item below on the branch you are on, then commit.

{{FINDINGS}}

Each is a cycle: where it is a behaviour, a failing test first, then the fix. Use
`mattpocock-skills:tdd`.

If an item cannot be closed from here — it is wrong, it needs a decision that is
not yours, or the failure is in the environment rather than the code — do not
force a change that hides it. Emit the block below instead and commit nothing.
The harness stops there and hands your reason to a human, so write it for them:
what you checked, why the code cannot fix it, and what would.

<declined>
one or two paragraphs, or nothing at all if you are committing a fix
</declined>

The harness re-runs the full gate suite after this phase, so do not run it yourself.

# Done

<promise>COMPLETE</promise>
