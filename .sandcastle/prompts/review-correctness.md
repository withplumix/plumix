# Task

Review the work on this branch for **correctness**. You did not write it.

```bash
git diff {{BASE}}...HEAD
```

Load `sentry-skills:code-review` and review that diff. Findings only — do not
edit any file, do not commit.

The ticket it claims to implement:

!`gh issue view {{TICKET}} --json number,title,body`

# Output

Emit your findings as JSON inside `<findings>` tags. Empty array if the diff is
sound. Severity is one of `high`, `medium`, `low`.

<findings>
{"findings": [{"file": "path/to/file.ts", "line": 42, "severity": "high", "summary": "one sentence", "why": "what breaks, with the input that breaks it"}]}
</findings>
