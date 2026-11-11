# Ticket

Issue **#{{TICKET}}** in `withplumix/plumix`:

!`gh issue view {{TICKET}} --json number,title,body,comments`

The brief may be in a comment rather than the body. Where comments disagree,
the latest one wins.

# Task

Prepare the implementation handoff against `{{BASE}}`. This sandbox has git and
GitHub access but dependencies have not been installed. Read the ticket, parent,
VISION.md, relevant ADRs, package notes and coding standards. Leave files and
commits unchanged.

Trace every affected consumer to its current entry point. Report file and line
evidence for those paths and each concrete premise below. Check issue dependencies
against GitHub; an unmerged dependency is a question that blocks implementation.
Produce observable acceptance criteria and an ordered TDD plan that names the
appropriate test tiers and checks. Record protected paths or unresolved decisions
as questions. Keep the plan within this issue's scope.

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

End with this block, as JSON. `ok` is true when the evidence supports the plan,
`falsePremises` is empty, and `questions` is empty. Every ready handoff needs
nonempty acceptance, plan and evidence arrays.

<brief-check>
{ "ok": true, "falsePremises": [], "acceptance": ["observable behaviour"], "plan": ["first failing test and implementation step"], "evidence": ["path/to/file.ts:42 and what it establishes"], "questions": [] }
</brief-check>

<promise>COMPLETE</promise>
