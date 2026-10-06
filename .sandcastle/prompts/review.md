# Task

Review the work on this branch and improve it. You did not write it.

Run `mattpocock-skills:code-review` with fixed point `{{BASE}}`. Its spec is
issue #{{TICKET}}, below, together with the PR description the harness will
publish for this branch. No PR exists yet, so a criterion about what the PR
records is met in that description or nowhere. Follow the skill as written:
its Standards and Spec reviews run as two sub-agents in parallel, so neither
axis sees the other's reasoning, and you wait for both before reading the diff
yourself. The skill only reports; its findings are your worklist.

!`gh issue view {{TICKET}} --json number,title,body,comments`

The PR description:

{{PR_BODY}}

A decision the ticket pins — a value, a trade-off, what stays duplicated, what
is left for a later ticket — is a requirement, even where you would have chosen
differently. The brief may be in a comment rather than the body. Leave the code
as the ticket pins it, and put your disagreement in `notes`.

# Act on the findings

- **Anything that looks breakable** — a tricky condition, an unchecked
  assumption, an edge the tests skip: write a test that tries to break it. If it
  breaks, fix it.
- **Standards findings:** fix every breach of a documented rule, even one the
  PR description admits. A baseline smell is a judgement call: fix it, or leave
  it and say why in `notes`. Never change what the code does, only how it does
  it.
- **Spec findings:** do not fix them. A missing criterion, one met in form but
  not in effect, or scope the ticket did not ask for goes in `specGaps`; the
  implementer closes it and you review again. A criterion that a suite, a
  typecheck, a lint or a build passes is met by the harness's gates, which run
  after this phase; it is never a spec gap, and neither you nor the implementer
  runs those suites to prove it.

`notes` hold only the smells you left and your disagreements with a pinned
decision. A rule about how the work was done, such as test-first order, leaves
nothing in a diff, so it is never a finding. Nor is an empty changeset: the
harness requires one whenever a published package's files change, and empty
means no release.

Run the test files you touched and a targeted typecheck of their packages. The
harness runs every gate after this phase. Commit your changes as one commit, by
the rules in AGENTS.md's "Commits, branches, PRs". Commit nothing if the code is
already right.

Commit on the branch you are on. Never create, switch or rename a branch, even when the
ticket names one: the harness owns this branch, and a commit anywhere else never reaches the
pull request.

Never run `git worktree` — add, remove or prune. The registry you would write to
is the host's, shared with every other checkout on that machine, and your own
worktree's path does not resolve from in here, so prune reads every one of them
as gone.

# Done

End with this block. `summary` says what you changed, in a sentence or two, or
is empty. `why` in a spec gap says what the ticket asks and what the diff does
instead.

<review>
{"summary": "what you changed", "specGaps": [{"file": "path/to/file.ts", "line": 42, "summary": "criterion 2 is not met", "why": "..."}], "notes": [{"file": "path/to/file.ts", "line": 7, "summary": "what you left", "why": "why"}]}
</review>

<promise>COMPLETE</promise>
