# Task

This is the weekly architecture review of `withplumix/plumix`. Find **one** fresh
deepening opportunity and write it up as a report the maintainer will review. There
is no one to ask: make every call yourself.

You only read. Do not edit a file, commit, or write to GitHub; the workflow files
the report. Your tools are limited to reading files, `git log`, and `gh issue list`
/ `gh issue view`, so anything else will be refused.

Load the `mattpocock-skills:codebase-design` skill first and use its vocabulary
exactly: **module**, **interface**, **depth**, **seam**, **adapter**,
**leverage**, **locality**. Use `GLOSSARY.md` for the domain.

# What is already known

Earlier proposals, in any state. One closed with a reason is binding; do not
propose it again in another form:

!`gh issue list --label source:architecture-review --state all --limit 200 --json number,title,state,stateReason`

Every open issue. Anything here is already being worked or decided:

!`gh issue list --state open --limit 300 --json number,title,labels --jq '.[] | "#\(.number) \(.title) [\(.labels | map(.name) | join(", "))]"'`

Read any of them in full with `gh issue view <n> --comments`. Read every ADR in
`docs/adr/` whose area you touch, plus `AGENTS.md` and the package's notes under
"Working on a package" in `CONTRIBUTING.md`.

# Explore

This step is taken word for word from the upstream `improve-codebase-architecture`
skill:

{{EXPLORE}}

# Choose one

1. Draft 3–5 candidates.
2. Drop duplicates. A candidate is a duplicate when it touches substantially the
   same modules as an earlier proposal, an open issue or an ADR, or addresses the
   same friction from another angle. When in doubt, it is a duplicate.
3. A candidate that contradicts an ADR survives only when the friction is real
   enough to reopen the ADR. Say so in the report.
4. Rank what is left on leverage, locality gain, how much cleaner the tests get,
   and cost against value. Pick the top one.
5. If nothing is left, skip.

Do not design the new interface. The maintainer decides its shape in a grilling
session; the report only has to make the case.

# The report

The maintainer starts a grilling session from this report, so every claim you
have not checked costs them time to undo.

- A difference between call sites is not a defect until you have looked for a
  reason it is deliberate: a comment beside it, a test that pins it, the commit
  that introduced it, or WordPress behaving the same way. Report a deliberate
  difference as a question for the maintainer, not as evidence.
- Before you claim a consequence ("the audit log never records X"), follow it to
  every subscriber that could handle it, and say what does happen as well as
  what does not.

Markdown, in this order:

```markdown
## Architecture review

### Files

The modules involved, with paths.

### Problem

The friction, in `GLOSSARY.md` and `codebase-design` vocabulary. Include the
deletion test's result. Keep what you can show is broken apart from differences
that may be intended, and list the second kind as questions.

### Solution

What would change, in plain English. No interface.

### Benefits

In terms of locality and leverage, and how the tests would improve.

### Before / After

A fenced `mermaid` diagram showing the shallow modules and the deepened one.

### Recommendation strength

`Strong`, `Worth exploring` or `Speculative`, and why, weighed on what you can
show is broken, not on the questions.

## Candidates considered

One line each: the candidate, and the issue or ADR that ruled it out, or why it
ranked lower.
```

The title starts with a lowercase verb, states the outcome, and stays under 80
characters, like the other issue titles above.

# Done

End with exactly one of these.

A proposal:

<title>the title</title>

<report>
the markdown report
</report>

A skip, when every candidate was a duplicate:

<skipped>The candidates you drafted, and the issue or ADR that covers each.</skipped>

<promise>COMPLETE</promise>
