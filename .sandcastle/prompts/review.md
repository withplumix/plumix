# Task

Review the work on this branch and hand over a verdict. You did not write it,
and you never write code: the implementer makes every change. Change no file
and make no commit. The harness discards any edit you make and runs the review
again on the commit it gave you, so what you judge is what ships.

Run `mattpocock-skills:code-review` with fixed point `{{BASE}}`. Its spec is
issue #{{TICKET}}, below, together with the PR description the harness will
publish for this branch. No PR exists yet, so a criterion about what the PR
records is met in that description or nowhere. Follow the skill as written:
its Standards and Spec reviews run as two sub-agents in parallel, so neither
axis sees the other's reasoning, and you wait for both before reading the diff
yourself. The skill only reports; so do you.

The Standards review answers the review checklist below for every changed
line, and nothing else: a "no" is a finding that names the checklist item and
the line. Hand the checklist to the Standards sub-agent as its standards, in
place of reading `CODING_STANDARDS.md` whole; it opens the section an item links
only to settle that item.

## Review checklist

{{CHECKLIST}}

!`gh issue view {{TICKET}} --json number,title,body,comments`

The PR description:

{{PR_BODY}}

A decision the ticket pins — a value, a trade-off, what stays duplicated, what
is left for a later ticket — is a requirement, even where you would have chosen
differently. The brief may be in a comment rather than the body. Leave the code
as the ticket pins it, and put your disagreement in `notes`.

{{SCOPE}}

# Act on the findings

- **Anything that looks breakable** — a tricky condition, an unchecked
  assumption, an edge the tests skip: try it. Delete any scratch test before you
  finish, since a file left behind discards the review. If it breaks, it is a
  spec gap naming the input and what goes wrong.
- **Surviving lines.** The harness ran `pnpm test:mutation` on this branch. Each
  line below took a change no unit test noticed. Judge each one as
  CODING_STANDARDS.md#mutation-testing says: when a unit test should catch it,
  a spec gap naming the case the test must cover; otherwise a named reason in
  `notes` for leaving it.

{{MUTATION}}
- **Standards findings:** each "no" on the checklist, even one the PR
  description admits, is a spec gap with the item's number in `checklist`; the
  implementer fixes it without changing what the code does. A spec finding has
  no `checklist`. Anything the checklist does not ask,
  such as a module that could be deeper, goes in `notes`, never in `specGaps`.
- **Spec findings:** a missing criterion, one met in form but
  not in effect, or scope the ticket did not ask for goes in `specGaps`; the
  implementer closes it. A criterion that a suite, a
  typecheck, a lint or a build passes is met by the harness's checks and CI; it
  is never a spec gap, and neither you nor the implementer runs the full suites
  to prove it.
- **A gap no change to the branch can close** gets `"needsADecision": true`:
  the brief contradicts itself, the code or `main`, or a pinned criterion
  cannot be met as written. Anything a change to the branch can close is not a
  decision, however the brief words it: a bug, a missing criterion, an
  unrequested addition, or the branch departing from a pinned contract, where
  the fix is to follow the brief. The harness sends decision gaps to the
  decider instead of the implementer, and to a person if the documents do not
  settle them, so `why` names the choice to make.

`notes` hold only the smells you left and your disagreements with a pinned
decision. A rule about how the work was done, such as test-first order, leaves
nothing in a diff, so it is never a finding.

You may run the branch's tests, lint and a targeted typecheck to check a
finding. The harness runs its fast checks after the implementer, and CI runs the
full suites. Never create, switch or rename a branch.

Never run `git worktree` — add, remove or prune. The registry you would write to
is the host's, shared with every other checkout on that machine, and your own
worktree's path does not resolve from in here, so prune reads every one of them
as gone.

# Done

End with this block. `summary` is your verdict in a sentence or two. `why` in a spec gap says what the ticket asks and what the diff does
instead.

<review>
{"summary": "the verdict", "specGaps": [{"file": "path/to/file.ts", "line": 42, "summary": "criterion 2 is not met", "why": "...", "needsADecision": false}, {"file": "path/to/other.ts", "line": 12, "summary": "checklist 3: the comment says what the code does", "why": "...", "checklist": 3}], "notes": [{"file": "path/to/file.ts", "line": 7, "summary": "what you left", "why": "why"}]}
</review>

<promise>COMPLETE</promise>
