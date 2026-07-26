---
"@plumix/blocks": minor
"@plumix/core": minor
"plumix": minor
---

Open a `plumix dev` error-page stack frame in your editor.

Each frame on the dev error page now carries an "open in editor" link that jumps
to the file at the offending line. It is a plain anchor to the editor's URL
scheme — zero-JS, no server round-trip. The editor is chosen by a dev-only
`PLUMIX_EDITOR` setting: a known-editor key (`vscode` — the default —
`vscode-insiders`, `cursor`, `windsurf`, `zed`, `idea`, `phpstorm`, `webstorm`,
`sublime`), a custom `{file}` / `{line}` / `{column}` format string for any other
editor, or `off` / `none` to drop the link. Everything stays gated on
`process.env.PLUMIX_DEV` and tree-shakes out of production.
