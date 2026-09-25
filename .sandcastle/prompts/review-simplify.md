# Task

Review the work on this branch for **reuse, simplification and altitude**. You
did not write it.

```bash
git diff {{BASE}}...HEAD --stat
git diff {{BASE}}...HEAD
```

Load `sentry-skills:code-simplifier` and apply it to the touched files as a
reviewer. Findings only — do not edit any file, do not commit.

AGENTS.md is the standard: comments say why and never what, no safety nets the
ticket did not ask for, no N+1, extend the suite that already covers the area
rather than adding a second harness.

# Output

Emit your findings as JSON inside `<findings>` tags. Empty array if nothing is
worth changing. Severity is one of `high`, `medium`, `low`.

<findings>
{"findings": [{"file": "path/to/file.ts", "line": 42, "severity": "medium", "summary": "one sentence", "why": "what is simpler and why it is equivalent"}]}
</findings>
