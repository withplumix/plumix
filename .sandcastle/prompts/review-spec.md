# Task

Review the work on this branch against **what the ticket actually asked for**.
You did not write it.

The ticket:

!`gh issue view {{TICKET}} --json number,title,body,comments`

The diff:

```bash
git diff {{BASE}}...HEAD
```

The PR description the harness will publish for this branch. No PR exists yet, so
a criterion about what the PR records is met here or nowhere:

{{PR_BODY}}

Load `mattpocock-skills:code-review` and run its Spec axis against `{{BASE}}`.
Findings only — do not edit any file, do not commit.

Every acceptance criterion is a question: is it met, and where in the diff? A
criterion that is silently unmet is a high finding. So is scope the ticket did
not ask for.

# Output

Emit your findings as JSON inside `<findings>` tags. Empty array if every
criterion is met with nothing extra.

<findings>
{"findings": [{"file": "path/to/file.ts", "line": 1, "severity": "high", "summary": "criterion N is not met", "why": "what the ticket asked and what the diff does instead"}]}
</findings>
