# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Ticket model label

`to-tickets` proposes one `model:` label per ticket in its quiz step. `/ship` reads it when it
spawns a subagent for that ticket. A ticket with no label runs on `opus`.

| model    | Pick it when                                                                                                                       |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `sonnet` | Mechanical and compiler-driven: a rename, a lockstep bump, a docs edit with no rewrite. The criteria enumerate every change.       |
| `opus`   | The default vertical slice, and anything spanning packages or surfaces, schema, auth, caching or the RPC contract.                 |
| `fable`  | Design-heavy: a wide refactor or expand–contract sequence, security-sensitive code, or criteria that need architectural judgement. |
