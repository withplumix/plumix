# Ticket

Issue **#{{TICKET}}** in `withplumix/plumix`:

!`gh issue view {{TICKET}} --json number,title,body,comments`

The brief may be in a comment rather than the body. Where comments disagree,
the latest one wins.

# Where this delivery stands

{{CONTEXT}}

# Task

Prepare the implementation handoff against `{{BASE}}`. This sandbox has git and
GitHub access but dependencies have not been installed. Read the ticket, parent,
VISION.md, `ARCHITECTURE.md` and the `docs/architecture/` page for each
subsystem it touches, relevant ADRs, package notes and coding standards. Leave files and
commits unchanged.

Trace every affected consumer to its current entry point. Report file and line
evidence for those paths and each concrete premise below. Check issue dependencies
against GitHub, including any the brief, its parent or the code imply but its
"Blocked by" does not list. Put each open issue or pull request this ticket must
wait for in `waitingOn`, by number: the harness checks they are open, leaves the
ticket for after they close, and asks no one.
Produce observable acceptance criteria and an ordered TDD plan that names the
appropriate test tiers and checks. List the paths the implementer must leave
untouched (generated files, another ticket's ground, a published surface the
brief does not change) in `protectedPaths`: they are constraints the implementer
follows, not questions. Keep the plan within this issue's scope.

Settle every choice you can yourself, and write it into the plan with the
document or code that settles it: where docs go, which pattern to follow, how
to name a thing, which tier a test sits in. The architecture pages, ADRs,
`VISION.md` (its principles are ranked) and the code around the change settle
most of them. When they leave two options open, pick the one that follows the
existing pattern and keeps scope, and say so in the plan; a reviewer or a
maintainer can overturn it. `questions` holds only what a person must answer:
a secret, a credential or an account; a security or data-loss trade-off;
cutting scope the ticket asks for; or a product direction neither the spec nor
`VISION.md` gives. An unmerged dependency goes in `waitingOn`, never in
`questions`.

Check each concrete premise:

- a file, function, type, export, primitive or command the brief names exists
  and does what the brief says it does;
- nothing the brief asks for contradicts an accepted ADR in `docs/adr/`,
  `AGENTS.md` or `CODING_STANDARDS.md`.

Report a premise only when it is false, you can show it with a file and line,
and acting on the brief as written would fail or break one of those pinned
rules. An acceptance criterion that a test suite, typecheck or build will check
is not a premise. Style, scope, naming and how you would have designed it are
not premises either. When in doubt, the brief is fine.

The kind of thing to catch, from briefs that cost a full implementation before
anyone noticed:

- a "millisecond migration" whose schema change makes D1 rebuild the table and
  cascade;
- "reuse the existing rate-limit primitive" when none exists and ADR 0041 rules
  one out;
- "log the transport used" when the Mailer has no name to log;
- a plugin told to reuse admin components that `plumix/admin` does not export.

# Done

End with this block, as JSON. Every path you cite in `evidence` must exist in
this repository; the harness checks. `ok` is true when the evidence supports the plan,
`falsePremises` is empty, and `questions` is empty. Every ready handoff needs
nonempty acceptance, plan and evidence arrays. Each false premise is an object
with `claim`, `evidence` and `why`, never a bare string; leave the array empty
when there are none. The example shows one so you see its shape.

<brief-check>
{ "ok": false, "falsePremises": [{ "claim": "what the brief says", "evidence": "path/to/file.ts:42", "why": "what acting on it as written would break" }], "acceptance": ["observable behaviour"], "plan": ["first failing test and implementation step"], "evidence": ["path/to/file.ts:42 and what it establishes"], "questions": [], "waitingOn": [], "protectedPaths": ["path/the/implementer/must/not/change"] }
</brief-check>

<promise>COMPLETE</promise>
