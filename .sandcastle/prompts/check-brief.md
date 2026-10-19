# Ticket

Issue **#{{TICKET}}** in `withplumix/plumix`:

!`gh issue view {{TICKET}} --json number,title,body,comments`

The brief may be in a comment rather than the body. Where comments disagree,
the latest one wins.

# Task

An agent is about to implement this brief unattended. Before it spends an hour
on it, check that what the brief takes for granted is true of the repo at
`{{BASE}}`. You do not design, plan or implement it. Edit no file and make no
commit.

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

End with this block, as JSON. `ok` is true when `falsePremises` is empty.

<brief-check>
{ "ok": false, "falsePremises": [{ "claim": "what the brief takes for granted", "evidence": "path/to/file.ts:42", "why": "what is actually there, and why acting on the brief as written fails" }] }
</brief-check>

<promise>COMPLETE</promise>
