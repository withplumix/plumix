# Issue

Issue **#{{ISSUE}}** in `withplumix/plumix`:

!`gh issue view {{ISSUE}} --json number,title,body,labels,comments`

# Task

Triage it. You read and judge; you do not label, comment, close, edit any file or
commit — the harness does all of that from the block you emit below.

1. **Verify the claim against the code as it is today.** The issue was written
   at some past moment and cites what it saw then; the repo has moved since.
   Read the code the claim is about. Reading is usually enough and is free.
   Dependencies are **not** installed: running a test means `pnpm install
   --frozen-lockfile` first, which costs minutes. Pay that only when running the
   test is what settles the claim and reading cannot — then
   `pnpm exec vitest run <path>` in the package (test:unit resolves to source,
   so nothing needs building).
2. **Read `CONTEXT.md`, `AGENTS.md` and any ADR in the area** before judging what
   the fix should look like.
3. **Decide the standing:**
   - `already-resolved` — the behaviour the issue asks for is how the code reads
     now. Cite the paths that show it in `touches`.
   - `needs-decision` — settling it needs a judgement only the maintainer can
     make: a choice between real alternatives, a product boundary, a public API
     shape nobody has chosen. Put the choice in `questions`, one question per
     entry, each one answerable in a sentence.
   - `live` — the claim holds and the way forward is not in doubt. Write the brief.

Prefer `needs-decision` over guessing. A brief that assumes a direction the
maintainer has not chosen costs a full implementation cycle to undo.

# The brief

For `live` only. This becomes the contract an unattended implementer works from,
and it may sit for weeks, so write it to survive the codebase moving underneath it:
name types, signatures and behaviours — never file paths, never line numbers.
Every criterion must be independently checkable.

```markdown
## Agent Brief

**Category:** bug / enhancement
**Summary:** one line

**Current behavior:**
What happens now.

**Desired behavior:**
What should happen, including edge cases.

**Key interfaces:**
- `TypeName`: what changes and why

**Acceptance criteria:**
- [ ] specific, testable
- [ ] specific, testable

**Out of scope:**
- what must not be touched
```

# Done

`touches` is for the harness, not the brief: the repo-relative paths this work
reads or changes, used to order tickets that collide. Paths are fine there.

Emit exactly one block. `brief` and `questions` are JSON strings — escape newlines.

<verdict>
{"standing": "live", "evidence": "what you checked and what you found", "touches": ["packages/core/src/..."], "brief": "## Agent Brief\n\n...", "questions": []}
</verdict>

<promise>COMPLETE</promise>
